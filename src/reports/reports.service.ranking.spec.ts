import { ReportsService } from './reports.service';
import { ROLE_IDS } from '../auth/constants/roles';

/**
 * ARK-SP1 #1 — `videojuegoData` alimenta la home pública: con el ranking oculto
 * lista los juegos pero sin notas (promedio, criterios, finalScore, avgJunior, avgSenior).
 */
describe('ReportsService.getVideogamesData — ranking oculto (ARK-SP1 #1)', () => {
  const prisma = {
    videogame: { findMany: jest.fn() },
    teamFinalScore: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn() },
  };
  const settings = { isRankingVisible: jest.fn() };
  const service = new ReportsService(prisma as any, settings as any);

  const admin = { id: 'a', roleId: ROLE_IDS.ADMIN } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.videogame.findMany.mockResolvedValue([
      {
        id: 2,
        name: 'Stella',
        logoUrl: 'x.png',
        team: {
          teamCode: 'N1-IST-101',
          teamName: 'T',
          members: [{ firstName: 'A', lastName: 'B', nrcs: [] }],
          assignedJurors: [{}, {}],
        },
        evaluations: [
          {
            totalScore: 4,
            details: [{ score: 4, criterion: { name: 'Arte' } }],
          },
        ],
      },
    ]);
    prisma.teamFinalScore.findMany.mockResolvedValue([
      { videogameId: 2, finalScore: 4.5, avgJunior: 4, avgSenior: 5 },
    ]);
    prisma.evaluation.findMany.mockResolvedValue([
      { videogameId: 2, isSenior: true, totalScore: 4 },
    ]);
  });

  const hiddenKeys = [
    'promedio',
    'criterios',
    'finalScore',
    'avgJunior',
    'avgSenior',
  ];

  it('con showRanking=false y sin usuario lista los juegos sin notas', async () => {
    settings.isRankingVisible.mockResolvedValue(false);
    const [game] = await service.getVideogamesData(undefined);
    expect(game).toMatchObject({ id: 2, nombre: 'Stella', logoUrl: 'x.png' });
    for (const k of hiddenKeys) expect(game).not.toHaveProperty(k);
  });

  it('con showRanking=false y administrador devuelve las notas', async () => {
    settings.isRankingVisible.mockResolvedValue(false);
    const [game] = await service.getVideogamesData(admin);
    expect(game).toMatchObject({
      promedio: 4.5,
      finalScore: 4.5,
      avgJunior: 4,
      avgSenior: 5,
    });
    expect(game.criterios).toEqual({ Arte: 4 });
  });

  it('con showRanking=true y sin usuario devuelve las notas', async () => {
    settings.isRankingVisible.mockResolvedValue(true);
    const [game] = await service.getVideogamesData(undefined);
    expect(game).toMatchObject({ promedio: 4.5, finalScore: 4.5 });
    expect(game).toHaveProperty('criterios');
  });

  it('con el ranking oculto no consulta las notas finales', async () => {
    settings.isRankingVisible.mockResolvedValue(false);
    await service.getVideogamesData(undefined);
    expect(prisma.teamFinalScore.findMany).not.toHaveBeenCalled();
  });
});
