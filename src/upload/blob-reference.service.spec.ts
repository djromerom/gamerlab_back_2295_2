import { BlobReferenceService } from './blob-reference.service';

describe('BlobReferenceService (Task 28)', () => {
  const azure = { signReadUrlById: jest.fn() };
  const prisma = { upload: { findFirst: jest.fn() } };
  let service: BlobReferenceService;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-01T00:00:00Z'));
    azure.signReadUrlById.mockImplementation(async (id: string) => ({
      url: `https://blob.test/c/${id}.png?sig=abc`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    }));
    service = new BlobReferenceService(azure as any, prisma as any);
  });

  afterEach(() => jest.useRealTimers());

  describe('resolve', () => {
    it('firma una referencia con vigencia de 1 hora', async () => {
      const url = await service.resolve('upload:abc-123');
      expect(azure.signReadUrlById).toHaveBeenCalledWith('abc-123', 3600);
      expect(url).toBe('https://blob.test/c/abc-123.png?sig=abc');
    });

    it('reutiliza la URL firmada durante 5 minutos y luego vuelve a firmar', async () => {
      await service.resolve('upload:abc-123');
      await service.resolve('upload:abc-123');
      expect(azure.signReadUrlById).toHaveBeenCalledTimes(1);
      jest.setSystemTime(Date.now() + 5 * 60_000 + 1);
      await service.resolve('upload:abc-123');
      expect(azure.signReadUrlById).toHaveBeenCalledTimes(2);
    });

    it('devuelve sin cambios un dato viejo (URL completa)', async () => {
      const legacy = 'https://blob.test/c/1-a.png?sig=old';
      expect(await service.resolve(legacy)).toBe(legacy);
      expect(azure.signReadUrlById).not.toHaveBeenCalled();
    });

    it('deja pasar null, undefined y vacío', async () => {
      expect(await service.resolve(null)).toBeNull();
      expect(await service.resolve(undefined)).toBeUndefined();
      expect(await service.resolve('')).toBe('');
    });

    it('devuelve null si el archivo referenciado ya no existe', async () => {
      azure.signReadUrlById.mockResolvedValue(null);
      expect(await service.resolve('upload:borrado')).toBeNull();
    });
  });

  describe('resolveVideogame', () => {
    it('resuelve logoUrl y gameFileUrl sin mutar el original', async () => {
      const vg = { id: 1, logoUrl: 'upload:a', gameFileUrl: 'https://old/x.zip?sig=1', name: 'n' };
      const out = await service.resolveVideogame(vg);
      expect(out.logoUrl).toBe('https://blob.test/c/a.png?sig=abc');
      expect(out.gameFileUrl).toBe('https://old/x.zip?sig=1');
      expect(vg.logoUrl).toBe('upload:a');
    });

    it('no toca videojuegos nulos', async () => {
      expect(await service.resolveVideogame(null)).toBeNull();
    });
  });

  describe('toReference', () => {
    beforeEach(() => {
      process.env.AZURE_CONTAINER = 'files';
    });

    it('convierte una URL firmada de nuestro blob en upload:<id>', async () => {
      prisma.upload.findFirst.mockResolvedValue({ id: 'u-1' });
      const ref = await service.toReference(
        'https://acct.blob.core.windows.net/files/1699-foto%20a.png?sv=2024&sp=r&sig=zzz',
      );
      expect(prisma.upload.findFirst).toHaveBeenCalledWith({
        where: { blobName: '1699-foto a.png' },
        select: { id: true },
      });
      expect(ref).toBe('upload:u-1');
    });

    it('deja igual una referencia ya guardada', async () => {
      expect(await service.toReference('upload:u-1')).toBe('upload:u-1');
      expect(prisma.upload.findFirst).not.toHaveBeenCalled();
    });

    it('deja igual una URL sin firma (no se puede referenciar un blob privado con solo su nombre)', async () => {
      const url = 'https://acct.blob.core.windows.net/files/1699-foto.png';
      expect(await service.toReference(url)).toBe(url);
      expect(prisma.upload.findFirst).not.toHaveBeenCalled();
    });

    it('deja igual una URL externa o que no corresponde a ningún upload', async () => {
      prisma.upload.findFirst.mockResolvedValue(null);
      const url = 'https://acct.blob.core.windows.net/files/9-x.png?sig=1';
      expect(await service.toReference(url)).toBe(url);
      expect(await service.toReference('no es url')).toBe('no es url');
    });

    it('mantiene null, undefined y vacío', async () => {
      expect(await service.toReference(null)).toBeNull();
      expect(await service.toReference(undefined)).toBeUndefined();
      expect(await service.toReference('')).toBe('');
    });
  });
});
