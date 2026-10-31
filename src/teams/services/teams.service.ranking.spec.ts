import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { ROLE_IDS } from '../../auth/constants/roles';

/**
 * ARK-SP1 #1 — Con `showRanking=false` las notas finales no se exponen por las
 * rutas públicas `final-score/videogame/:id` y `final-score/team/:id`, salvo al
 * Administrador.
 */
describe('TeamsService — ranking oculto (ARK-SP1 #1)', () => {
  const finalScore = { findMany: jest.fn() };
  const prisma = {
    teamFinalScore: finalScore,
    edition: { findFirst: jest.fn() },
  };
  const settings = { getShowRanking: jest.fn() };
  const service = new TeamsService(
    {} as any,
    {} as any,
    {} as any,
    prisma as any,
    settings as any,
  );

  const admin = { id: 'a', roleId: ROLE_IDS.ADMIN } as any;
  const student = { id: 's', roleId: ROLE_IDS.STUDENT } as any;
  const rows = [{ teamId: 1, videogameId: 2, finalScore: 4.5 }];

  beforeEach(() => {
    jest.resetAllMocks();
    finalScore.findMany.mockResolvedValue(rows);
  });

  const cases: [string, (u?: any) => Promise<any>][] = [
    ['getFinalScoreByTeam', (u) => service.getFinalScoreByTeam(1, u)],
    ['getFinalScoreByVideogame', (u) => service.getFinalScoreByVideogame(2, u)],
  ];

  describe.each(cases)('%s', (_name, call) => {
    it('con showRanking=false y sin usuario lanza Forbidden', async () => {
      settings.getShowRanking.mockResolvedValue({ showRanking: false });
      await expect(call(undefined)).rejects.toThrow(ForbiddenException);
      expect(finalScore.findMany).not.toHaveBeenCalled();
    });

    it('con showRanking=false y un estudiante lanza Forbidden', async () => {
      settings.getShowRanking.mockResolvedValue({ showRanking: false });
      await expect(call(student)).rejects.toThrow(ForbiddenException);
    });

    it('con showRanking=false y administrador devuelve datos', async () => {
      settings.getShowRanking.mockResolvedValue({ showRanking: false });
      await expect(call(admin)).resolves.toEqual(rows);
    });

    it('con showRanking=true y sin usuario devuelve datos', async () => {
      settings.getShowRanking.mockResolvedValue({ showRanking: true });
      await expect(call(undefined)).resolves.toEqual(rows);
    });
  });

  describe('getFinalScoreByTeamCodePrefix (by-n)', () => {
    const byN = [
      {
        teamId: 1,
        teamCode: 'N1-A',
        teamName: 'T',
        logoUrl: 'l',
        finalScore: 4,
      },
    ];
    beforeEach(() => {
      prisma.edition.findFirst.mockResolvedValue({ id: 3 });
      finalScore.findMany.mockResolvedValue(byN);
    });

    it('con showRanking=false y sin usuario devuelve []', async () => {
      settings.getShowRanking.mockResolvedValue({ showRanking: false });
      await expect(
        service.getFinalScoreByTeamCodePrefix('N1', undefined),
      ).resolves.toEqual([]);
      expect(finalScore.findMany).not.toHaveBeenCalled();
    });

    it('con showRanking=false y un estudiante devuelve []', async () => {
      settings.getShowRanking.mockResolvedValue({ showRanking: false });
      await expect(
        service.getFinalScoreByTeamCodePrefix('N1', student),
      ).resolves.toEqual([]);
    });

    it('con showRanking=false y administrador devuelve datos', async () => {
      settings.getShowRanking.mockResolvedValue({ showRanking: false });
      await expect(
        service.getFinalScoreByTeamCodePrefix('all', admin),
      ).resolves.toHaveLength(1);
    });

    it('con showRanking=true y sin usuario devuelve datos', async () => {
      settings.getShowRanking.mockResolvedValue({ showRanking: true });
      await expect(
        service.getFinalScoreByTeamCodePrefix('N1', undefined),
      ).resolves.toHaveLength(1);
    });

    it('prefix inválido sigue dando 400', async () => {
      settings.getShowRanking.mockResolvedValue({ showRanking: false });
      await expect(
        service.getFinalScoreByTeamCodePrefix('', undefined),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('assertRankingVisible no consulta el ajuste si el usuario es administrador', async () => {
    await expect(
      (service as any).assertRankingVisible(admin),
    ).resolves.toBeUndefined();
    expect(settings.getShowRanking).not.toHaveBeenCalled();
  });
});
