import { ReportsService } from './reports.service';
import { ROLE_IDS } from '../auth/constants/roles';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

/**
 * ARK-SP1 T29 — NRCData y DatosGraficoMateria son públicas: con el ranking oculto
 * (o sin edición activa) y un usuario que no es administrador devuelven las mismas
 * filas con el promedio en null.
 */
describe('ReportsService — promedios por NRC y por materia con el ranking oculto (ARK-SP1 T29)', () => {
  const prisma = {
    nRC: { findMany: jest.fn() },
    videogame: { findMany: jest.fn() },
    teamFinalScore: { findMany: jest.fn() },
    subject: { findMany: jest.fn() },
    // ARK-135: los reportes se calculan sobre la edición activa
    edition: { findFirst: jest.fn().mockResolvedValue({ id: 3, title: 'Feria 3', status: 'ACTIVE' }) },
  };
  const settings = { isRankingVisible: jest.fn() };
  const service = new ReportsService(prisma as any, settings as any, blobRefsPassthrough());
  const admin = { id: 'a', roleId: ROLE_IDS.ADMIN } as any;
  const student = { id: 's', roleId: ROLE_IDS.STUDENT } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    // Todo juego tiene fila en la vista; sin fila (rechazado o no calificable) no cuenta (BG-43)
    prisma.teamFinalScore.findMany.mockResolvedValue([
      { videogameId: 9, finalScore: 4, legacyFinalScoreRule: false },
    ]);
    prisma.nRC.findMany.mockResolvedValue([
      { id: 1, code: 111, subject: { name: 'Algoritmos' } },
      { id: 2, code: 222, subject: { name: 'Diseño' } },
    ]);
    prisma.videogame.findMany.mockResolvedValue([
      {
        id: 9,
        team: { members: [{ nrcs: [{ id: 1 }] }] },
        evaluations: [{ totalScore: 4 }],
      },
    ]);
    prisma.subject.findMany.mockResolvedValue([
      {
        name: 'Algoritmos',
        nrcs: [
          {
            members: [
              {
                team: {
                  videogame: { evaluations: [{ details: [{ score: 3 }] }] },
                },
              },
            ],
          },
        ],
      },
      { name: 'Diseño', nrcs: [] },
    ]);
  });

  describe('getNrcWithSubjectNameAndAverage', () => {
    it('ranking visible: promedios de hoy para cualquiera', async () => {
      settings.isRankingVisible.mockResolvedValue(true);
      const res = await service.getNrcWithSubjectNameAndAverage(undefined);
      expect(res).toEqual([
        { id: 1, codigo: 111, materiaNombre: 'Algoritmos', promedioxNRC: 4 },
        {
          id: 2,
          codigo: 222,
          materiaNombre: 'Diseño',
          promedioxNRC: undefined,
        },
      ]);
    });

    it.each([
      ['anónimo', undefined],
      ['estudiante', student],
    ])(
      'ranking oculto + %s: mismas filas con promedioxNRC null',
      async (_n, user) => {
        settings.isRankingVisible.mockResolvedValue(false);
        const res = await service.getNrcWithSubjectNameAndAverage(user);
        expect(res).toEqual([
          {
            id: 1,
            codigo: 111,
            materiaNombre: 'Algoritmos',
            promedioxNRC: null,
          },
          { id: 2, codigo: 222, materiaNombre: 'Diseño', promedioxNRC: null },
        ]);
      },
    );

    it('HU-34: en una edición vigente promedia la nota final, no las evaluaciones', async () => {
      settings.isRankingVisible.mockResolvedValue(true);
      prisma.videogame.findMany.mockResolvedValue([
        {
          id: 7,
          team: { members: [{ nrcs: [{ id: 1 }] }] },
          evaluations: [{ totalScore: 1 }],
        },
        {
          id: 8, // «Nota en proceso»: no entra al promedio
          team: { members: [{ nrcs: [{ id: 1 }] }] },
          evaluations: [{ totalScore: 5 }],
        },
      ]);
      prisma.teamFinalScore.findMany.mockResolvedValue([
        { videogameId: 7, finalScore: 4.2, legacyFinalScoreRule: false },
        { videogameId: 8, finalScore: null, legacyFinalScoreRule: false },
      ]);
      const res = await service.getNrcWithSubjectNameAndAverage(undefined);
      expect(res[0].promedioxNRC).toBe(4.2);
    });

    it('ranking oculto + administrador: promedios reales', async () => {
      settings.isRankingVisible.mockResolvedValue(false);
      const res = await service.getNrcWithSubjectNameAndAverage(admin);
      expect(res[0].promedioxNRC).toBe(4);
    });

    it('sin edición activa (isRankingVisible false) cuenta como oculto', async () => {
      settings.isRankingVisible.mockResolvedValue(false);
      const res = await service.getNrcWithSubjectNameAndAverage(undefined);
      expect(res.every((r) => r.promedioxNRC === null)).toBe(true);
    });

    it('oculto: no consulta evaluaciones (no calcula notas que no va a mostrar)', async () => {
      settings.isRankingVisible.mockResolvedValue(false);
      await service.getNrcWithSubjectNameAndAverage(undefined);
      expect(prisma.videogame.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getSubjectAverageScores', () => {
    it('ranking visible: promedios de hoy', async () => {
      settings.isRankingVisible.mockResolvedValue(true);
      const res = await service.getSubjectAverageScores(undefined);
      expect(res).toEqual([
        { name: 'Algoritmos', value: 3 },
        // ARK-265: una materia sin notas es null («Sin nota»), no 0
        { name: 'Diseño', value: null },
      ]);
    });

    describe('ARK-265 (BG-65): evaluaciones sin detalle por criterio', () => {
      const subjectWith = (name: string, evaluations: object[]) => ({
        name,
        nrcs: [{ members: [{ team: { videogame: { evaluations } } }] }],
      });

      it('la nota del profesor a un colegio (solo el total, sin detalle) cuenta como una nota', async () => {
        settings.isRankingVisible.mockResolvedValue(true);
        prisma.subject.findMany.mockResolvedValue([
          subjectWith('Colegios', [
            { totalScore: 3.8, isSenior: true, details: [] },
            { totalScore: 3.6, isSenior: true, details: [] },
          ]),
        ]);
        const res = await service.getSubjectAverageScores(undefined);
        expect(res).toEqual([{ name: 'Colegios', value: 3.7 }]);
      });

      it('una evaluación con detalle sigue contando por criterio y la que no lo trae, por su total', async () => {
        settings.isRankingVisible.mockResolvedValue(true);
        prisma.subject.findMany.mockResolvedValue([
          subjectWith('Mixta', [
            { totalScore: 4, details: [{ score: 4 }, { score: 2 }] },
            { totalScore: 5, details: [] },
          ]),
        ]);
        const res = await service.getSubjectAverageScores(undefined);
        // (4 + 2 + 5) / 3
        expect(res).toEqual([{ name: 'Mixta', value: 3.67 }]);
      });

      it('una evaluación sin detalle y sin total no cuenta, y sin ninguna nota la materia es null', async () => {
        settings.isRankingVisible.mockResolvedValue(true);
        prisma.subject.findMany.mockResolvedValue([
          subjectWith('Vacía', [{ totalScore: null, details: [] }]),
          { name: 'Sin equipos', nrcs: [] },
        ]);
        const res = await service.getSubjectAverageScores(undefined);
        expect(res).toEqual([
          { name: 'Vacía', value: null },
          { name: 'Sin equipos', value: null },
        ]);
      });

      it('un 0 real sigue siendo 0, no «Sin nota»', async () => {
        settings.isRankingVisible.mockResolvedValue(true);
        prisma.subject.findMany.mockResolvedValue([
          subjectWith('Con cero', [{ totalScore: 0, details: [{ score: 0 }] }]),
        ]);
        const res = await service.getSubjectAverageScores(undefined);
        expect(res).toEqual([{ name: 'Con cero', value: 0 }]);
      });
    });

    it.each([
      ['anónimo', undefined],
      ['estudiante', student],
    ])(
      'ranking oculto + %s: mismas materias con value null',
      async (_n, user) => {
        settings.isRankingVisible.mockResolvedValue(false);
        const res = await service.getSubjectAverageScores(user);
        expect(res).toEqual([
          { name: 'Algoritmos', value: null },
          { name: 'Diseño', value: null },
        ]);
      },
    );

    it('ranking oculto + administrador: promedios reales', async () => {
      settings.isRankingVisible.mockResolvedValue(false);
      const res = await service.getSubjectAverageScores(admin);
      expect(res[0].value).toBe(3);
    });
  });
});
