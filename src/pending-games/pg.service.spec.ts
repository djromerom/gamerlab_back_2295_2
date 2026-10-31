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
});
