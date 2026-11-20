import { TeamsService } from './teams.service';
import { ROLE_IDS } from '../../auth/constants/roles';
import { blobRefsPassthrough } from '../../upload/blob-reference.mock';
import {
  canSeeScoreBreakdown,
  withoutScoreBreakdown,
} from '../final-score-breakdown';

/**
 * ARK-154 (HU-30): el estudiante ve solo la nota final de su grupo. Las rutas públicas
 * `GET /teams/final-score/*` dejan de enviarle `avgJunior` (promedio de jurados) y `avgSenior`
 * (nota del profesor); el Administrador, el Profesor y el Jurado siguen recibiéndolos.
 */
describe('TeamsService — final-score sin desglose para el estudiante (ARK-154)', () => {
  const finalScore = { findMany: jest.fn() };
  const prisma = {
    teamFinalScore: finalScore,
    edition: { findFirst: jest.fn() },
  };
  const settings = { isRankingVisible: jest.fn() };
  const service = new TeamsService(
    {} as any,
    {} as any,
    {} as any,
    prisma as any,
    settings as any,
    blobRefsPassthrough(),
    { orderRows: async (rows: any[]) => rows.map((r, i) => ({ ...r, levelPosition: i + 1 })) } as any,
  );

  const as = (roleId: number) => ({ id: `u${roleId}`, roleId }) as any;
  const row = {
    teamId: 1,
    teamCode: 'N1-A-101',
    teamName: 'Equipo',
    logoUrl: 'logo',
    videogameId: 2,
    editionId: 3,
    finalScore: 4.12,
    avgJunior: 4.5,
    avgSenior: 3.8,
    juniorEvaluations: 3,
    juniorCounted: 3,
    seniorEvaluations: 1,
  };
  const { avgJunior: _j, avgSenior: _s, ...withoutBreakdown } = row;

  beforeEach(() => {
    jest.resetAllMocks();
    settings.isRankingVisible.mockResolvedValue(true);
    prisma.edition.findFirst.mockResolvedValue({ id: 3 });
    finalScore.findMany.mockResolvedValue([row]);
  });

  const routes: [string, (u?: any) => Promise<any[] | null>][] = [
    ['final-score/team/:teamId', (u) => service.getFinalScoreByTeam(1, u)],
    [
      'final-score/videogame/:id',
      (u) => service.getFinalScoreByVideogame(2, u),
    ],
  ];

  describe.each(routes)('%s', (_route, call) => {
    it('el estudiante recibe la nota final sin avgJunior ni avgSenior', async () => {
      const [result] = (await call(as(ROLE_IDS.STUDENT)))!;
      expect(result).toEqual(withoutBreakdown);
      expect(result).not.toHaveProperty('avgJunior');
      expect(result).not.toHaveProperty('avgSenior');
    });

    it('sin sesión (ruta pública) tampoco recibe el desglose', async () => {
      const [result] = (await call(undefined))!;
      expect(result).toEqual(withoutBreakdown);
    });

    it.each([
      ['Administrador', ROLE_IDS.ADMIN],
      ['Profesor', ROLE_IDS.PROFESSOR],
      ['Jurado', ROLE_IDS.JUROR],
    ])('%s sigue recibiendo el desglose', async (_name, roleId) => {
      const [result] = (await call(as(roleId)))!;
      expect(result).toEqual(row);
    });
  });

  // HU-48 (ARK-306): el ranking público no envía ninguna nota, a ningún rol.
  it.each([
    ['sin sesión', undefined],
    ['Estudiante', ROLE_IDS.STUDENT],
    ['Profesor', ROLE_IDS.PROFESSOR],
    ['Jurado', ROLE_IDS.JUROR],
    ['Administrador', ROLE_IDS.ADMIN],
  ])('final-score/by-n/:n no envía notas (%s)', async (_name, roleId) => {
    const [result] = await service.getFinalScoreByTeamCodePrefix(
      'N1',
      roleId === undefined ? undefined : as(roleId),
    );
    expect(result).toMatchObject({ teamId: 1, levelPosition: 1, level: 1 });
    for (const field of ['finalScore', 'avgJunior', 'avgSenior'])
      expect(result).not.toHaveProperty(field);
  });

  it('withoutScoreBreakdown no modifica las filas originales', () => {
    const rows = [{ ...row }];
    withoutScoreBreakdown(rows, as(ROLE_IDS.STUDENT));
    expect(rows[0]).toEqual(row);
  });

  it('canSeeScoreBreakdown: solo Administrador, Profesor y Jurado', () => {
    expect(canSeeScoreBreakdown(as(ROLE_IDS.ADMIN))).toBe(true);
    expect(canSeeScoreBreakdown(as(ROLE_IDS.PROFESSOR))).toBe(true);
    expect(canSeeScoreBreakdown(as(ROLE_IDS.JUROR))).toBe(true);
    expect(canSeeScoreBreakdown(as(ROLE_IDS.STUDENT))).toBe(false);
    expect(canSeeScoreBreakdown(as(5))).toBe(false); // Staff
    expect(canSeeScoreBreakdown(undefined)).toBe(false);
  });
});
