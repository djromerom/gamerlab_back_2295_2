import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { VideogamesService } from './pg.service';

describe('VideogamesService (pending-games)', () => {
  let service: VideogamesService;

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
    service = new VideogamesService(prismaMock as never, blobRefsPassthrough());
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
