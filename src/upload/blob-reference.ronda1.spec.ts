import { BlobReferenceService } from './blob-reference.service';
import { ReportsService } from '../reports/reports.service';
import { HighlightedGamesService } from '../highlighted-games/highlighted-games.service';
import { TeamsService } from '../teams/services/teams.service';
import { VideogamesService } from '../videogames/videogames.service';
import { ROLE_IDS } from '../auth/constants/roles';

/** Task 28, ronda 1 - ningun endpoint devuelve `upload:<id>` crudo; additionalImages tambien es referencia. */
describe('Task 28 ronda 1', () => {
  const azure = { signReadUrlById: jest.fn(), containerUrls: ['https://acct.blob.core.windows.net/files'] };
  const uploadPrisma = { upload: { findFirst: jest.fn() } };
  const SIGNED = (id: string) => `https://blob.test/files/${id}?sig=s`;
  let blobRefs: BlobReferenceService;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.AZURE_CONTAINER = 'files';
    azure.signReadUrlById.mockImplementation(async (id: string) =>
      id === 'borrado' ? null : { url: SIGNED(id), expiresAt: 'x' },
    );
    blobRefs = new BlobReferenceService(azure as any, uploadPrisma as any);
  });

  describe('additionalImages en BlobReferenceService', () => {
    it('resolveVideogame firma cada imagen, respeta las viejas y descarta las borradas', async () => {
      const legacy = 'https://old/x.png?sig=1';
      const out = await blobRefs.resolveVideogame({
        additionalImages: ['upload:a', legacy, 'upload:borrado'],
      } as any);
      expect((out as any).additionalImages).toEqual([SIGNED('a'), legacy]);
    });

    it('referenceVideogameFields convierte cada URL firmada en referencia', async () => {
      uploadPrisma.upload.findFirst.mockImplementation(async ({ where }: any) =>
        where.blobName === '1-a.png' ? { id: 'A', isPublic: true, createdAt: new Date() } : where.id === 'B' ? { id: 'B', isPublic: true, createdAt: new Date() } : null,
      );
      const out = await blobRefs.referenceVideogameFields({
        additionalImages: [
          'https://acct.blob.core.windows.net/files/1-a.png?sig=q',
          'https://externa.com/z.png',
          'upload:B',
        ],
      } as any);
      expect((out as any).additionalImages).toEqual([
        'upload:A',
        'https://externa.com/z.png',
        'upload:B',
      ]);
    });
  });

  describe('ReportsService', () => {
    const vg = {
      id: 1,
      name: 'a',
      logoUrl: 'upload:L1',
      team: { teamCode: 'N1-A', teamName: 't', isExternal: false, members: [], assignedJurors: [] },
      evaluations: [],
    };
    const prisma = {
      videogame: { findMany: jest.fn() },
      teamFinalScore: { findMany: jest.fn().mockResolvedValue([]) },
      evaluation: { findMany: jest.fn().mockResolvedValue([]) },
    };

    it('getVideogamesData y getVideogamesDataFilter firman el logo', async () => {
      prisma.videogame.findMany.mockResolvedValue([vg]);
      prisma.teamFinalScore.findMany.mockResolvedValue([]);
      prisma.evaluation.findMany.mockResolvedValue([]);
      const service = new ReportsService(prisma as any, { isRankingVisible: jest.fn().mockResolvedValue(true) } as any, blobRefs);
      expect((await service.getVideogamesData())[0].logoUrl).toBe(SIGNED('L1'));
      expect((await service.getVideogamesDataFilter())[0].logoUrl).toBe(SIGNED('L1'));
    });
  });

  describe('HighlightedGamesService', () => {
    it('findAll firma logo, archivo e imagenes del videojuego', async () => {
      const prisma = {
        highlightedGame: { findMany: jest.fn(), count: jest.fn() },
        $transaction: jest.fn(async () => [
          [
            {
              editionId: 1,
              videogame: {
                id: 1,
                logoUrl: 'upload:L1',
                gameFileUrl: 'upload:Z1',
                additionalImages: ['upload:I1'],
              },
            },
          ],
          1,
        ]),
      };
      const service = new HighlightedGamesService(prisma as any, blobRefs);
      const res: any = await service.findAll(1, { limit: 10, page: 1 } as any);
      expect(res.data[0].videogame.logoUrl).toBe(SIGNED('L1'));
      expect(res.data[0].videogame.gameFileUrl).toBe(SIGNED('Z1'));
      expect(res.data[0].videogame.additionalImages).toEqual([SIGNED('I1')]);
    });
  });

  describe('TeamsService', () => {
    const repository = { findAll: jest.fn(), findOne: jest.fn(), updateTeamInfo: jest.fn() };
    const prisma = { teamFinalScore: { findMany: jest.fn() }, videogame: { findUnique: jest.fn().mockResolvedValue(null) } };
    let service: TeamsService;
    beforeEach(() => {
      service = new TeamsService({} as any, repository as any, {} as any, prisma as any, { isRankingVisible: jest.fn().mockResolvedValue(true) } as any, blobRefs, { orderRows: async (rows: any[]) => rows } as any);
    });

    it('GET /teams firma additionalImages', async () => {
      repository.findAll.mockResolvedValue([
        { id: 1, members: [], videogame: { id: 1, logoUrl: null, additionalImages: ['upload:I1', 'upload:I2'] } },
      ]);
      const [t]: any = await service.findAll(false, true);
      expect(t.videogame.additionalImages).toEqual([SIGNED('I1'), SIGNED('I2')]);
    });

    it('final-score por videojuego y por equipo firman videogameLogoUrl', async () => {
      prisma.teamFinalScore.findMany.mockResolvedValue([{ teamId: 1, videogameLogoUrl: 'upload:L1' }]);
      expect((await service.getFinalScoreByVideogame(1))![0].videogameLogoUrl).toBe(SIGNED('L1'));
      expect((await service.getFinalScoreByTeam(1))![0].videogameLogoUrl).toBe(SIGNED('L1'));
    });

    it('el ranking por prefijo firma videogameLogoUrl ademas de logoUrl', async () => {
      (prisma as any).edition = { findFirst: jest.fn().mockResolvedValue({ id: 1 }) };
      prisma.teamFinalScore.findMany.mockResolvedValue([
        { teamId: 1, teamName: 'T', logoUrl: 'upload:L1', videogameLogoUrl: 'upload:L2', finalScore: 1 },
      ]);
      const [r]: any = await service.getFinalScoreByTeamCodePrefix('all');
      expect(r.logoUrl).toBe(SIGNED('L1'));
      expect(r.videogameLogoUrl).toBe(SIGNED('L2'));
    });

    it('PATCH guarda additionalImages como referencias', async () => {
      repository.findOne.mockResolvedValue({ id: 1, userId: 'u1' });
      uploadPrisma.upload.findFirst.mockResolvedValue({ id: 'I9', isPublic: true, createdAt: new Date() });
      await service.updateTeamInfo(
        1,
        { videogame: { additionalImages: ['https://acct.blob.core.windows.net/files/3-i.png?sig=z'] } } as any,
        { id: 'u1', roleId: ROLE_IDS.STUDENT } as any,
      );
      expect(repository.updateTeamInfo.mock.calls[0][1].videogame.additionalImages).toEqual(['upload:I9']);
    });
  });

  describe('VideogamesService', () => {
    it('findAll firma additionalImages y update las guarda como referencia', async () => {
      const prisma = { videogame: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
      const service = new VideogamesService(prisma as any, {} as any, blobRefs);
      prisma.videogame.findMany.mockResolvedValue([
        {
          id: 1, name: 'a', description: 'd', logoUrl: null, videoUrl: null, repoUrl: null,
          additionalImages: ['upload:I1'], team: { teamName: 't', members: [] }, videogameStatus: { status: 's' },
        },
      ]);
      expect(((await service.findAll()) as any)[0].additionalImages).toEqual([SIGNED('I1')]);

      prisma.videogame.findUnique.mockResolvedValue({ id: 1, team: { userId: 'u1' } });
      uploadPrisma.upload.findFirst.mockResolvedValue({ id: 'I9', isPublic: true, createdAt: new Date() });
      await service.update(
        1,
        { additionalImages: ['https://acct.blob.core.windows.net/files/3-i.png?sig=z'] } as any,
        { id: 'u1', roleId: ROLE_IDS.STUDENT } as any,
      );
      expect(prisma.videogame.update.mock.calls[0][0].data.additionalImages).toEqual(['upload:I9']);
    });
  });
});
