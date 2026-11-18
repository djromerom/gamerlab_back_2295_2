import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { GradedGamesService } from './graded-games.service';

describe('GradedGamesService.searchGradedGames (BG-60)', () => {
  let service: GradedGamesService;

  const prismaMock = {
    eventConfiguration: { findFirst: jest.fn() },
    evaluation: { findMany: jest.fn() },
    videogame: { findMany: jest.fn() },
  };

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
    team: {
      teamName,
      teamCode,
      members: [{ firstName: member[0], lastName: member[1], nrcs: [nrc] }],
    },
  });
  const games = [
    game(1, 'Operación Segura', 'Los Guardianes', 'N2-AYP-202', [
      'Óscar',
      'Pardo',
    ]),
    game(2, 'Pixel Run', 'Equipo Rápido', 'N1-ABC-101', ['Iván', 'Cárdenas'], {
      code: 5678,
      subject: { code: 'DIS', name: 'Diseño Gráfico' },
    }),
  ];

  const ids = async (query: string) =>
    (await service.searchGradedGames('juror-1', query)).data.map(
      (g) => g.videogameId,
    );

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.eventConfiguration.findFirst.mockResolvedValue({
      evaluationsOpen: true,
    });
    prismaMock.evaluation.findMany.mockResolvedValue([
      {
        videogameId: 1,
        totalScore: 4.5,
        comments: 'Bien',
        details: [
          { criterionId: 1, score: 4, criterion: { name: 'Jugabilidad' } },
          { criterionId: 2, score: 5, criterion: { name: 'Arte' } },
        ],
      },
      { videogameId: 2, totalScore: 3, comments: null, details: [] },
    ]);
    prismaMock.videogame.findMany.mockResolvedValue(games);
    service = new GradedGamesService(
      prismaMock as never,
      blobRefsPassthrough(),
    );
  });

  it('«202» y «N2-AYP-202» encuentran el equipo por su código', async () => {
    expect(await ids('202')).toEqual([1]);
    expect(await ids('N2-AYP-202')).toEqual([1]);
  });

  it('«operacion» encuentra «Operación Segura»', async () => {
    expect(await ids('operacion')).toEqual([1]);
  });

  it('ignora tildes en equipo, integrantes y materia; busca por NRC y código de materia', async () => {
    expect(await ids('rapido')).toEqual([2]);
    expect(await ids('oscar')).toEqual([1]);
    expect(await ids('cardenas')).toEqual([2]);
    expect(await ids('diseno')).toEqual([2]);
    expect(await ids('5678')).toEqual([2]);
    expect(await ids('dis')).toEqual([2]);
  });

  it('una búsqueda que no coincide no devuelve nada; vacía devuelve todo', async () => {
    expect(await ids('zzz')).toEqual([]);
    expect(await ids('')).toEqual([1, 2]);
  });

  it('trae solo los juegos que calificó, sin condiciones de búsqueda en la BD, y responde igual que antes', async () => {
    const result = await service.searchGradedGames('juror-1', '202');

    const [query] = prismaMock.videogame.findMany.mock.calls[0] as [
      { where: unknown },
    ];
    expect(query.where).toEqual({ id: { in: [1, 2] } });
    expect(result.data).toEqual([
      {
        videogameId: 1,
        videogameName: 'Operación Segura',
        logoUrl: undefined,
        description: 'd',
        teamName: 'Los Guardianes',
        teamCode: 'N2-AYP-202',
        members: [{ fullName: 'Óscar Pardo' }],
        nrc: '1234',
        subject: 'Programación',
        totalScore: 4.5,
        comments: 'Bien',
        criteria: [
          { criterionId: 1, name: 'Jugabilidad', score: 4 },
          { criterionId: 2, name: 'Arte', score: 5 },
        ],
        isEvaluated: true,
      },
    ]);
  });
});

describe('GradedGamesService: puntaje por criterio en Calificados (ARK-264 / BG-64)', () => {
  let service: GradedGamesService;

  const prismaMock = {
    eventConfiguration: { findFirst: jest.fn() },
    evaluation: { findMany: jest.fn() },
    videogame: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };

  const game = (id: number, name: string) => ({
    id,
    name,
    logoUrl: null,
    description: 'd',
    team: { teamName: `Equipo ${id}`, teamCode: `N1-ABC-10${id}`, members: [] },
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    prismaMock.eventConfiguration.findFirst.mockResolvedValue({
      evaluationsOpen: true,
    });
    prismaMock.evaluation.findMany.mockResolvedValue([
      {
        videogameId: 1,
        totalScore: 4.25,
        comments: 'Bien',
        details: [
          { criterionId: 1, score: 4.5, criterion: { name: 'Jugabilidad' } },
          { criterionId: 3, score: 4, criterion: { name: 'Innovación' } },
        ],
      },
      { videogameId: 2, totalScore: 3, comments: null, details: [] },
    ]);
    prismaMock.videogame.findMany.mockResolvedValue([
      game(1, 'Stella'),
      game(2, 'Pixel Run'),
    ]);
    prismaMock.videogame.count.mockResolvedValue(2);
    service = new GradedGamesService(
      prismaMock as never,
      blobRefsPassthrough(),
    );
  });

  it('pide solo los detalles activos, con el nombre del criterio y en orden', async () => {
    await service.getGradedVideogames('juror-1', 10, 1);

    const [query] = prismaMock.evaluation.findMany.mock.calls[0] as [
      { select: { details: unknown } },
    ];
    expect(query.select.details).toEqual({
      where: { isActive: true },
      orderBy: { criterionId: 'asc' },
      select: {
        criterionId: true,
        score: true,
        criterion: { select: { name: true } },
      },
    });
  });

  it('la lista devuelve el puntaje por criterio de cada juego calificado', async () => {
    const page = await service.getGradedVideogames('juror-1', 10, 1);

    expect(
      page.data.map((g) => [g.videogameId, g.totalScore, g.criteria]),
    ).toEqual([
      [
        1,
        4.25,
        [
          { criterionId: 1, name: 'Jugabilidad', score: 4.5 },
          { criterionId: 3, name: 'Innovación', score: 4 },
        ],
      ],
      [2, 3, []],
    ]);
  });

  it('la búsqueda también devuelve el puntaje por criterio', async () => {
    const result = await service.searchGradedGames('juror-1', 'stella');

    expect(result.data).toHaveLength(1);
    expect(result.data[0].criteria).toEqual([
      { criterionId: 1, name: 'Jugabilidad', score: 4.5 },
      { criterionId: 3, name: 'Innovación', score: 4 },
    ]);
  });
});
