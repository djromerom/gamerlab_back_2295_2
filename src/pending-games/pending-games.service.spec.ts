import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { PendingGamesService } from './pending-games.service';

describe('PendingGamesService (pending-games)', () => {
  let service: PendingGamesService;

  const prismaMock = {
    eventConfiguration: { findFirst: jest.fn() },
    videogame: { findMany: jest.fn(), count: jest.fn() },
  };

  const pendingVideogame = {
    id: 7,
    name: 'Juego',
    logoUrl: null,
    description: 'Descripción',
    team: {
      id: 10,
      teamName: 'Equipo',
      teamCode: 'N10-ABC-1001',
      members: [{ firstName: 'Ana', lastName: 'Gómez', nrcs: [] }],
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.eventConfiguration.findFirst.mockResolvedValue({
      evaluationsOpen: true,
    });
    prismaMock.videogame.findMany.mockResolvedValue([pendingVideogame]);
    prismaMock.videogame.count.mockResolvedValue(1);
    service = new PendingGamesService(prismaMock as never, blobRefsPassthrough());
  });

  // El front necesita el teamId para llamar a /team-verification/verify y /status (HU-19).
  const selectsTeamId = () =>
    expect(prismaMock.videogame.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          team: { select: expect.objectContaining({ id: true }) as unknown },
        }) as unknown,
      }),
    );

  it('getPendingVideogames devuelve el teamId de cada juego', async () => {
    const result = await service.getPendingVideogames('juror-1', 10, 1);

    selectsTeamId();
    expect(result.data[0]).toMatchObject({
      videogameId: 7,
      teamId: 10,
      teamCode: 'N10-ABC-1001',
    });
  });

  it('searchPendingGames devuelve el teamId de cada juego', async () => {
    const result = await service.searchPendingGames('juror-1', 'Juego');

    selectsTeamId();
    expect(result.data[0]).toMatchObject({
      id: 7,
      teamId: 10,
      teamCode: 'N10-ABC-1001',
    });
  });

  it('BG-35: el jurado solo ve juegos confirmados, también en el conteo', async () => {
    await service.getPendingVideogames('juror-1', 10, 1);
    await service.getPendingVideogamesCount('juror-1');

    const confirmed = { videogameStatus: { status: 'CONFIRMADO' } };
    expect(JSON.stringify(prismaMock.videogame.findMany.mock.calls[0][0].where)).toContain(
      JSON.stringify(confirmed).slice(1, -1),
    );
    expect(JSON.stringify(prismaMock.videogame.count.mock.calls.at(-1)?.[0].where)).toContain(
      JSON.stringify(confirmed).slice(1, -1),
    );
  });

  describe('BG-60: búsqueda sin tildes y por código de equipo', () => {
    const game = (
      id: number,
      name: string,
      teamName: string,
      teamCode: string,
      member: [string, string],
      nrc = { code: 1234, subject: { code: 'IST', name: 'Programación' } },
    ) => ({
      id,
      name,
      logoUrl: null,
      description: 'd',
      evaluationDrafts: [],
      team: {
        id: id * 10,
        teamName,
        teamCode,
        members: [{ firstName: member[0], lastName: member[1], nrcs: [nrc] }],
      },
    });
    const games = [
      game(1, 'Operación Segura', 'Los Guardianes', 'N2-AYP-202', ['Óscar', 'Pardo']),
      game(2, 'Pixel Run', 'Equipo Rápido', 'N1-ABC-101', ['Iván', 'Cárdenas'], {
        code: 5678,
        subject: { code: 'DIS', name: 'Diseño Gráfico' },
      }),
    ];
    const ids = async (query: string) =>
      (await service.searchPendingGames('juror-1', query)).data.map((g) => g.id);

    beforeEach(() => prismaMock.videogame.findMany.mockResolvedValue(games));

    it('«202» y «N2-AYP-202» encuentran el equipo por su código', async () => {
      expect(await ids('202')).toEqual([1]);
      expect(await ids('N2-AYP-202')).toEqual([1]);
      expect(await ids('n2-ayp')).toEqual([1]);
    });

    it('«operacion» encuentra «Operación Segura»', async () => {
      expect(await ids('operacion')).toEqual([1]);
      expect(await ids('OPERACION segura')).toEqual([1]);
    });

    it('ignora tildes en equipo, integrantes y materia; busca por NRC y código de materia', async () => {
      expect(await ids('rapido')).toEqual([2]);
      expect(await ids('oscar')).toEqual([1]);
      expect(await ids('cardenas')).toEqual([2]);
      expect(await ids('diseno grafico')).toEqual([2]);
      expect(await ids('5678')).toEqual([2]);
      expect(await ids('dis')).toEqual([2]);
    });

    it('una búsqueda que no coincide no devuelve nada; vacía devuelve todo', async () => {
      expect(await ids('zzz')).toEqual([]);
      expect(await ids('   ')).toEqual([1, 2]);
    });

    it('busca en todos los NRC del integrante pero muestra solo el primero, como antes', async () => {
      const twoNrcs = game(3, 'Otro', 'Equipo', 'N3-XYZ-303', ['Eva', 'Ruiz']);
      twoNrcs.team.members[0].nrcs.push({ code: 9999, subject: { code: 'MAT', name: 'Cálculo' } });
      prismaMock.videogame.findMany.mockResolvedValue([twoNrcs]);

      const result = await service.searchPendingGames('juror-1', 'calculo');

      expect(result.data.map((g) => [g.id, g.nrc, g.materia])).toEqual([[3, '1234', 'Programación']]);
    });

    it('trae los juegos con el filtro base (sin condiciones de búsqueda) y responde igual que antes', async () => {
      const result = await service.searchPendingGames('juror-1', '202');

      const where = JSON.stringify(prismaMock.videogame.findMany.mock.calls[0][0].where);
      expect(where).not.toContain('insensitive');
      expect(result.data).toEqual([
        {
          id: 1,
          nombre: 'Operación Segura',
          equipo: 'Los Guardianes',
          teamId: 10,
          teamCode: 'N2-AYP-202',
          materia: 'Programación',
          nrc: '1234',
          participantes: ['Óscar Pardo'],
          imagen: undefined,
          descripcion: 'd',
          isEvaluated: false,
          hasDraft: false,
          draftUpdatedAt: null,
        },
      ]);
    });
  });

  describe('HU-18: borradores en la lista de pendientes', () => {
    const savedAt = new Date('2026-11-26T10:00:00Z');

    it('marca el juego con borrador del jurado y sigue en pendientes', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([
        { ...pendingVideogame, evaluationDrafts: [{ updatedAt: savedAt }] },
        { ...pendingVideogame, id: 8, evaluationDrafts: [] },
      ]);

      const result = await service.getPendingVideogames('juror-1', 10, 1);

      expect(prismaMock.videogame.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            evaluationDrafts: {
              where: { jurorId: 'juror-1', isActive: true },
              select: { updatedAt: true },
            },
          }) as unknown,
        }),
      );
      expect(result.data.map((g) => [g.videogameId, g.hasDraft, g.draftUpdatedAt])).toEqual([
        [7, true, savedAt],
        [8, false, null],
      ]);
    });

    it('la búsqueda también lo marca', async () => {
      prismaMock.videogame.findMany.mockResolvedValue([
        { ...pendingVideogame, evaluationDrafts: [{ updatedAt: savedAt }] },
      ]);

      const result = await service.searchPendingGames('juror-1', 'Juego');

      expect(result.data[0]).toMatchObject({ hasDraft: true, draftUpdatedAt: savedAt });
    });

    it('el conteo de pendientes (y el aviso de HU-37) no mira borradores', async () => {
      await service.getPendingVideogamesCount('juror-1');

      expect(JSON.stringify(prismaMock.videogame.count.mock.calls[0][0])).not.toContain(
        'evaluationDrafts',
      );
    });
  });
});
