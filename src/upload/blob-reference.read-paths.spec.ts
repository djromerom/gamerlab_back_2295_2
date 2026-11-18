import { BlobReferenceService } from './blob-reference.service';
import { VideogamesService } from '../videogames/videogames.service';
import { HistoricalsService } from '../historicals/historicals.service';
import { GradedGamesService } from 'src/graded-games/graded-games.service';
import { PendingGamesService } from 'src/pending-games/pending-games.service';
import { ROLE_IDS } from '../auth/constants/roles';

/** Task 28 — el resto de lecturas públicas firman al leer y los PATCH guardan la referencia. */
describe('Referencia de blob en el resto de lecturas y escrituras (Task 28)', () => {
  const azure = { signReadUrlById: jest.fn(), containerUrls: ['https://acct.blob.core.windows.net/files'] };
  const uploadPrisma = { upload: { findFirst: jest.fn() } };
  let blobRefs: BlobReferenceService;
  const SIGNED = (id: string) => `https://blob.test/files/${id}?sig=s`;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.AZURE_CONTAINER = 'files';
    azure.signReadUrlById.mockImplementation(async (id: string) => ({
      url: SIGNED(id),
      expiresAt: 'x',
    }));
    blobRefs = new BlobReferenceService(azure as any, uploadPrisma as any);
  });

  describe('VideogamesService', () => {
    const prisma = {
      videogame: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      eventConfiguration: { findFirst: async () => ({ registrationsOpen: true }) }, // ARK-161: inscripciones abiertas
    };
    let service: VideogamesService;
    beforeEach(() => {
      service = new VideogamesService(prisma as any, {} as any, blobRefs);
    });

    it('findAll firma el logo guardado como referencia y deja intacto el dato viejo', async () => {
      const base = {
        description: 'd',
        videoUrl: null,
        repoUrl: null,
        additionalImages: [],
        team: { teamName: 't', members: [] },
        videogameStatus: { status: 'ok' },
      };
      prisma.videogame.findMany.mockResolvedValue([
        { id: 1, name: 'a', logoUrl: 'upload:L1', ...base },
        { id: 2, name: 'b', logoUrl: 'https://old/x.png?sig=1', ...base },
      ]);
      const res: any = await service.findAll();
      expect(res[0].logoUrl).toBe(SIGNED('L1'));
      expect(res[1].logoUrl).toBe('https://old/x.png?sig=1');
    });

    it('findOne firma gameFileURL', async () => {
      prisma.videogame.findUnique.mockResolvedValue({
        id: 1,
        name: 'a',
        description: 'd',
        gameFileUrl: 'upload:Z1',
        entry: 'index.html',
        team: { teamName: 't' },
        videogameStatus: { status: 'ok' },
      });
      const res: any = await service.findOne(1);
      expect(res.gameFileURL).toBe(SIGNED('Z1'));
    });

    it('PATCH guarda la referencia, no la URL firmada', async () => {
      prisma.videogame.findUnique.mockResolvedValue({ id: 1, team: { userId: 'u1', edition: { status: 'ACTIVE', title: 'E5' } } });
      uploadPrisma.upload.findFirst.mockResolvedValue({ id: 'L9', isPublic: true, createdAt: new Date() });
      await service.update(
        1,
        { logoUrl: 'https://acct.blob.core.windows.net/files/1-a.png?sv=1&sig=zz' } as any,
        { id: 'u1', roleId: ROLE_IDS.STUDENT } as any,
      );
      expect(prisma.videogame.update.mock.calls[0][0].data.logoUrl).toBe('upload:L9');
    });
  });

  describe('HistoricalsService', () => {
    const prisma = {
      historicalTeam: { findMany: jest.fn() },
      historicalVideogame: { findUnique: jest.fn(), update: jest.fn() },
      edition: { findUnique: jest.fn() },
    };
    let service: HistoricalsService;
    beforeEach(() => {
      service = new HistoricalsService(prisma as any, blobRefs);
    });

    it('getAllHistoricalTeams firma logo y archivo del juego histórico', async () => {
      prisma.historicalTeam.findMany.mockResolvedValue([
        { id: 1, videogame: { id: 3, logoUrl: 'upload:L1', gameFileUrl: 'upload:Z1' } },
        { id: 2, videogame: null },
      ]);
      const res: any = await service.getAllHistoricalTeams();
      expect(res[0].videogame.logoUrl).toBe(SIGNED('L1'));
      expect(res[0].videogame.gameFileUrl).toBe(SIGNED('Z1'));
      expect(res[1].videogame).toBeNull();
    });

    it('getHistoricalVideogamesByEdition firma al leer', async () => {
      prisma.edition.findUnique.mockResolvedValue({ id: 1 });
      prisma.historicalTeam.findMany.mockResolvedValue([
        { id: 1, videogame: { id: 3, logoUrl: 'upload:L1', gameFileUrl: null } },
      ]);
      const res: any = await service.getHistoricalVideogamesByEdition(1);
      expect(res[0].logoUrl).toBe(SIGNED('L1'));
    });

    it('PATCH del videojuego histórico guarda la referencia', async () => {
      prisma.historicalVideogame.findUnique.mockResolvedValue({ id: 3 });
      uploadPrisma.upload.findFirst.mockResolvedValue({ id: 'Z7', isPublic: true, createdAt: new Date() });
      await service.updateHistoricalVideogame(3, {
        gameFileUrl: 'https://acct.blob.core.windows.net/files/2-g.zip?sig=q',
      } as any);
      expect(prisma.historicalVideogame.update.mock.calls[0][0].data.gameFileUrl).toBe('upload:Z7');
    });
  });

  describe('juegos calificados y pendientes del jurado', () => {
    const team = { id: 1, teamName: 't', teamCode: 'c', members: [] };

    it('GradedGames firma el logo', async () => {
      const prisma = {
        eventConfiguration: { findFirst: jest.fn().mockResolvedValue({ evaluationsOpen: true }) },
        evaluation: { findMany: jest.fn().mockResolvedValue([{ videogameId: 1, details: [] }]) },
        videogame: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 1, name: 'a', logoUrl: 'upload:L1', description: 'd', team }]),
          count: jest.fn().mockResolvedValue(1),
        },
        $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
      };
      const service = new GradedGamesService(prisma as any, blobRefs);
      const res: any = await service.searchGradedGames('j1', 'a');
      expect(res.data[0].logoUrl).toBe(SIGNED('L1'));
    });

    it('PendingGames firma el logo', async () => {
      const prisma = {
        eventConfiguration: { findFirst: jest.fn().mockResolvedValue({ evaluationsOpen: true }) },
        videogame: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 1, name: 'a', logoUrl: 'upload:L1', description: 'd', team }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      const service = new PendingGamesService(prisma as any, blobRefs);
      const res: any = await service.getPendingVideogames('j1', 10, 1);
      expect(res.data[0].logoUrl).toBe(SIGNED('L1'));
    });
  });
});
