import { BadRequestException } from '@nestjs/common';
import { BlobReferenceService } from './blob-reference.service';
import { TeamsService } from '../teams/services/teams.service';
import { VideogamesService } from '../videogames/videogames.service';
import { HistoricalsService } from '../historicals/historicals.service';
import { ROLE_IDS } from '../auth/constants/roles';

/**
 * Task 28, ronda 2 (C1): un cliente no puede referenciar el archivo privado de otro.
 * Se acepta `upload:<id>` solo si (a) ya es el valor guardado, (b) el upload es publico o
 * (c) se subio hace <= 15 min (y entonces se marca publico). Si no: 400 «Archivo no válido».
 * Cada ruta de escritura se prueba con los cuatro casos.
 */
describe('Task 28 ronda 2 - control de acceso al referenciar', () => {
  const OLD = new Date(Date.now() - 3600_000);
  const uploads: Record<string, { id: string; isPublic: boolean; createdAt: Date }> = {};
  const uploadDb = {
    upload: {
      findFirst: jest.fn(async ({ where }: any) => (where.id ? uploads[where.id] ?? null : null)),
      update: jest.fn(),
    },
  };
  const azure = {
    containerUrls: ['https://acct.blob.core.windows.net/files'],
    signReadUrlById: jest.fn(async (id: string) => ({ url: `https://blob.test/${id}?sig=s`, expiresAt: 'x' })),
  };
  let blobRefs: BlobReferenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    uploads.stored = { id: 'stored', isPublic: false, createdAt: OLD }; // privado y viejo, pero ya guardado
    uploads.pub = { id: 'pub', isPublic: true, createdAt: OLD };
    uploads.fresh = { id: 'fresh', isPublic: false, createdAt: new Date(Date.now() - 60_000) };
    uploads.foreign = { id: 'foreign', isPublic: false, createdAt: OLD }; // privado ajeno
    blobRefs = new BlobReferenceService(azure as any, uploadDb as any);
  });

  /** Casos comunes: [nombre, valor enviado, debe aceptarse, marca publico] */
  const cases: [string, string, boolean, boolean][] = [
    ['(a) igual al ya guardado', 'upload:stored', true, false],
    ['(b) archivo publico', 'upload:pub', true, false],
    ['(c) subido hace <= 15 min', 'upload:fresh', true, true],
    ['rechazo: privado y ajeno', 'upload:foreign', false, false],
  ];

  describe('PATCH /teams/:id/info (TeamsService.updateTeamInfo)', () => {
    const repository = { findOne: jest.fn(), updateTeamInfo: jest.fn() };
    const prisma = { videogame: { findUnique: jest.fn() } };
    let service: TeamsService;
    beforeEach(() => {
      repository.findOne.mockResolvedValue({ id: 1, userId: 'u1' });
      prisma.videogame.findUnique.mockResolvedValue({ logoUrl: 'upload:stored', gameFileUrl: null, additionalImages: [] });
      repository.updateTeamInfo.mockResolvedValue({ id: 1, videogame: { logoUrl: 'upload:pub', additionalImages: [] } });
      service = new TeamsService({} as any, repository as any, {} as any, prisma as any, { isRankingVisible: jest.fn().mockResolvedValue(true) } as any, blobRefs, {} as any);
    });

    it.each(cases)('%s', async (_n, value, ok, marksPublic) => {
      const call = service.updateTeamInfo(1, { videogame: { logoUrl: value } } as any, { id: 'u1', roleId: ROLE_IDS.STUDENT } as any);
      if (!ok) {
        await expect(call).rejects.toThrow(BadRequestException);
        expect(repository.updateTeamInfo).not.toHaveBeenCalled();
        return;
      }
      const res: any = await call;
      expect(repository.updateTeamInfo.mock.calls[0][1].videogame.logoUrl).toBe(value);
      expect(uploadDb.upload.update).toHaveBeenCalledTimes(marksPublic ? 1 : 0);
      // I3: la respuesta nunca trae la referencia cruda
      expect(res.videogame.logoUrl).toBe('https://blob.test/pub?sig=s');
    });
  });

  describe('PATCH /teams/:id completo (TeamsService.update)', () => {
    it('rechaza una referencia ajena y resuelve updatedVideogame en la respuesta', async () => {
      const repository = { findOne: jest.fn().mockResolvedValue({ id: 1, userId: 'u1' }), update: jest.fn() };
      const prisma = { videogame: { findUnique: jest.fn().mockResolvedValue(null) } };
      const service = new TeamsService({} as any, repository as any, {} as any, prisma as any, { isRankingVisible: jest.fn().mockResolvedValue(true) } as any, blobRefs, {} as any);
      const user = { id: 'u1', roleId: ROLE_IDS.STUDENT } as any;
      await expect(service.update(1, { isExternal: false, videogame: { gameFileUrl: 'upload:foreign' } } as any, user)).rejects.toThrow(
        BadRequestException,
      );
      repository.update.mockResolvedValue({ updatedTeam: {}, updatedVideogame: { logoUrl: 'upload:pub' } });
      const res: any = await service.update(1, { isExternal: false, videogame: { logoUrl: 'upload:pub' } } as any, user);
      expect(res.updatedVideogame.logoUrl).toBe('https://blob.test/pub?sig=s');
    });
  });

  describe('POST /teams (TeamsService.createAsAdmin)', () => {
    it('rechaza una referencia ajena (400) y devuelve el videojuego firmado', async () => {
      const repository = { createTeam: jest.fn() };
      const service = new TeamsService({} as any, repository as any, {} as any, {} as any, { isRankingVisible: jest.fn().mockResolvedValue(true) } as any, blobRefs, {} as any);
      const admin = { id: 'a', roleId: ROLE_IDS.ADMIN } as any;
      await expect(service.createAsAdmin({ videogame: { logoUrl: 'upload:foreign' } } as any, admin)).rejects.toThrow(BadRequestException);
      repository.createTeam.mockResolvedValue({ team: {}, members: [], videogame: { logoUrl: 'upload:fresh' } });
      const res: any = await service.createAsAdmin({ videogame: { logoUrl: 'upload:fresh' } } as any, admin);
      expect(res.videogame.logoUrl).toBe('https://blob.test/fresh?sig=s');
    });
  });

  describe('PATCH /videogames/:id (VideogamesService.update)', () => {
    const prisma = { videogame: { findUnique: jest.fn(), update: jest.fn() } };
    let service: VideogamesService;
    beforeEach(() => {
      prisma.videogame.findUnique.mockResolvedValue({ id: 1, logoUrl: 'upload:stored', team: { userId: 'u1' } });
      prisma.videogame.update.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));
      service = new VideogamesService(prisma as any, {} as any, blobRefs);
    });

    it.each(cases)('%s', async (_n, value, ok, marksPublic) => {
      const call = service.update(1, { logoUrl: value } as any, { id: 'u1', roleId: ROLE_IDS.STUDENT } as any);
      if (!ok) {
        await expect(call).rejects.toThrow(BadRequestException);
        expect(prisma.videogame.update).not.toHaveBeenCalled();
        return;
      }
      const res: any = await call;
      expect(prisma.videogame.update.mock.calls[0][0].data.logoUrl).toBe(value);
      expect(uploadDb.upload.update).toHaveBeenCalledTimes(marksPublic ? 1 : 0);
      expect(res.logoUrl).toBe(`https://blob.test/${value.slice(7)}?sig=s`); // respuesta firmada
    });
  });

  describe('PATCH historico (HistoricalsService.updateHistoricalVideogame)', () => {
    const prisma = { historicalVideogame: { findUnique: jest.fn(), update: jest.fn() } };
    let service: HistoricalsService;
    beforeEach(() => {
      prisma.historicalVideogame.findUnique.mockResolvedValue({ id: 3, gameFileUrl: 'upload:stored', additionalImages: [] });
      prisma.historicalVideogame.update.mockImplementation(async ({ data }: any) => ({ id: 3, ...data }));
      service = new HistoricalsService(prisma as any, blobRefs);
    });

    it.each(cases)('%s', async (_n, value, ok, marksPublic) => {
      const call = service.updateHistoricalVideogame(3, { gameFileUrl: value } as any);
      if (!ok) {
        await expect(call).rejects.toThrow(BadRequestException);
        expect(prisma.historicalVideogame.update).not.toHaveBeenCalled();
        return;
      }
      const res: any = await call;
      expect(prisma.historicalVideogame.update.mock.calls[0][0].data.gameFileUrl).toBe(value);
      expect(uploadDb.upload.update).toHaveBeenCalledTimes(marksPublic ? 1 : 0);
      expect(res.gameFileUrl).toBe(`https://blob.test/${value.slice(7)}?sig=s`);
    });

    it('un archivo que ya no existe se resuelve a null, nunca a la referencia cruda', async () => {
      azure.signReadUrlById.mockResolvedValueOnce(null as any);
      uploads.gone = { id: 'gone', isPublic: true, createdAt: OLD };
      const res: any = await service.updateHistoricalVideogame(3, { gameFileUrl: 'upload:gone' } as any);
      expect(res.gameFileUrl).toBeNull();
    });
  });

  describe('GET /videogames/:id (I2)', () => {
    it('gameFileURL cae a "" cuando el archivo ya no existe, nunca a upload:<id>', async () => {
      azure.signReadUrlById.mockResolvedValueOnce(null as any);
      const prisma = {
        videogame: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1, name: 'a', description: 'd', gameFileUrl: 'upload:perdido', entry: 'i.html',
            team: { teamName: 't' }, videogameStatus: { status: 's' },
          }),
        },
      };
      const service = new VideogamesService(prisma as any, {} as any, blobRefs);
      expect(((await service.findOne(1)) as any).gameFileURL).toBe('');
    });
  });
});
