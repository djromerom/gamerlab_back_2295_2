import { ForbiddenException } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { ReportsService } from '../reports/reports.service';
import { TeamsService } from './services/teams.service';
import { ROLE_IDS } from '../auth/constants/roles';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

/**
 * ARK-SP1: en el periodo entre ediciones (sin configuración de edición ACTIVE) el
 * ranking se trata como oculto, sin 404 (la home pública depende de estas rutas).
 */
describe('Ranking sin edición activa (ARK-SP1)', () => {
  const prisma: any = {
    eventConfiguration: { findFirst: jest.fn().mockResolvedValue(null) },
    edition: { findFirst: jest.fn().mockResolvedValue(null) },
    teamFinalScore: { findMany: jest.fn() },
    videogame: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn() },
  };
  const settings = new SettingsService(prisma);
  const teams = new TeamsService(
    {} as any,
    {} as any,
    {} as any,
    prisma,
    settings,
    blobRefsPassthrough(),
    { orderRows: async (rows: any[]) => rows } as any, // RankingService (HU-04)
  );
  const reports = new ReportsService(prisma, settings, blobRefsPassthrough());
  const admin = { id: 'a', roleId: ROLE_IDS.ADMIN } as any;
  const rows = [{ teamId: 1, finalScore: 3 }];

  beforeEach(() => {
    prisma.teamFinalScore.findMany.mockReset().mockResolvedValue(rows);
    prisma.videogame.findMany.mockReset().mockResolvedValue([
      {
        id: 2,
        name: 'Stella',
        logoUrl: null,
        team: {
          teamCode: 'N1',
          teamName: 'T',
          members: [],
          assignedJurors: [],
        },
        evaluations: [],
      },
    ]);
    prisma.evaluation.findMany.mockReset().mockResolvedValue([]);
  });

  it('videojuegoData anónimo lista los juegos sin notas (sin 404)', async () => {
    const [game] = await reports.getVideogamesData(undefined);
    expect(game).toMatchObject({ id: 2, nombre: 'Stella' });
    expect(game).not.toHaveProperty('promedio');
    expect(game).not.toHaveProperty('finalScore');
  });

  it('by-n anónimo devuelve []', async () => {
    await expect(
      teams.getFinalScoreByTeamCodePrefix('N1', undefined),
    ).resolves.toEqual([]);
  });

  it('by-n admin devuelve [] (no hay edición activa, como antes)', async () => {
    await expect(
      teams.getFinalScoreByTeamCodePrefix('N1', admin),
    ).resolves.toEqual([]);
  });

  it('final-score/team anónimo => 403 (no 404)', async () => {
    await expect(
      teams.getFinalScoreByTeam(1, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('final-score/team admin devuelve los datos', async () => {
    await expect(teams.getFinalScoreByTeam(1, admin)).resolves.toEqual(rows);
  });
});
