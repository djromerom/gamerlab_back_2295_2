import { BadRequestException } from '@nestjs/common';
import { BlobReferenceService } from './blob-reference.service';

describe('BlobReferenceService (Task 28)', () => {
  const azure = { signReadUrlById: jest.fn(), containerUrls: ['https://acct.blob.core.windows.net/files'] };
  const prisma = { upload: { findFirst: jest.fn(), update: jest.fn() } };
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
    const OWN = 'https://acct.blob.core.windows.net/files/1699-foto%20a.png?sv=2024&sp=r&sig=zzz';
    const upload = (over: Record<string, unknown> = {}) => ({
      id: 'u-1',
      isPublic: false,
      createdAt: new Date(Date.now() - 3600_000),
      ...over,
    });

    it('convierte una URL firmada de nuestro blob en upload:<id> (archivo publico)', async () => {
      prisma.upload.findFirst.mockResolvedValue(upload({ isPublic: true }));
      expect(await service.toReference(OWN)).toBe('upload:u-1');
      expect(prisma.upload.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { blobName: '1699-foto a.png' } }),
      );
    });

    it('(a) acepta una referencia privada si es igual a la ya guardada', async () => {
      prisma.upload.findFirst.mockResolvedValue(upload());
      expect(await service.toReference('upload:u-1', 'upload:u-1')).toBe('upload:u-1');
    });

    it('(a) acepta la URL firmada reenviada si el valor guardado es esa misma referencia o la URL vieja', async () => {
      prisma.upload.findFirst.mockResolvedValue(upload());
      expect(await service.toReference(OWN, 'upload:u-1')).toBe('upload:u-1');
      expect(await service.toReference('upload:u-1', OWN)).toBe('upload:u-1');
    });

    it('(a) en arreglos acepta lo que ya esta en el arreglo guardado', async () => {
      prisma.upload.findFirst.mockResolvedValue(upload());
      expect(await service.toReference('upload:u-1', ['upload:x', 'upload:u-1'])).toBe('upload:u-1');
    });

    it('(b) acepta una referencia a un archivo publico', async () => {
      prisma.upload.findFirst.mockResolvedValue(upload({ isPublic: true }));
      expect(await service.toReference('upload:u-1', null)).toBe('upload:u-1');
      expect(prisma.upload.update).not.toHaveBeenCalled();
    });

    it('(c) acepta un archivo de <= 15 min y lo marca publico', async () => {
      prisma.upload.findFirst.mockResolvedValue(upload({ createdAt: new Date(Date.now() - 10 * 60_000) }));
      expect(await service.toReference('upload:u-1', null)).toBe('upload:u-1');
      expect(prisma.upload.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { isPublic: true } });
    });

    it('rechaza con 400 un archivo privado y antiguo que no es el guardado', async () => {
      prisma.upload.findFirst.mockResolvedValue(upload());
      await expect(service.toReference('upload:u-1', 'upload:otro')).rejects.toThrow(BadRequestException);
      await expect(service.toReference(OWN, null)).rejects.toThrow('Archivo no válido');
      expect(prisma.upload.update).not.toHaveBeenCalled();
    });

    it('rechaza con 400 una referencia a un upload inexistente', async () => {
      prisma.upload.findFirst.mockResolvedValue(null);
      await expect(service.toReference('upload:fantasma')).rejects.toThrow(BadRequestException);
    });

    it('deja igual una URL con firma pero de otro host (externa) y no consulta la BD', async () => {
      const ext = 'https://evil.example.com/files/1699-foto.png?sig=zzz';
      expect(await service.toReference(ext)).toBe(ext);
      const sameHostOtherContainer = 'https://acct.blob.core.windows.net/otro/1699-foto.png?sig=zzz';
      expect(await service.toReference(sameHostOtherContainer)).toBe(sameHostOtherContainer);
      expect(prisma.upload.findFirst).not.toHaveBeenCalled();
    });

    it('deja igual una URL sin firma, o de nuestro contenedor sin upload', async () => {
      const unsigned = 'https://acct.blob.core.windows.net/files/1699-foto.png';
      expect(await service.toReference(unsigned)).toBe(unsigned);
      prisma.upload.findFirst.mockResolvedValue(null);
      const unknown = 'https://acct.blob.core.windows.net/files/9-x.png?sig=1';
      expect(await service.toReference(unknown)).toBe(unknown);
      expect(await service.toReference('no es url')).toBe('no es url');
    });

    it('mantiene null, undefined y vacio', async () => {
      expect(await service.toReference(null)).toBeNull();
      expect(await service.toReference(undefined)).toBeUndefined();
      expect(await service.toReference('')).toBe('');
    });
  });
});
