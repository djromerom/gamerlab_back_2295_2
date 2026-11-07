import { Logger } from '@nestjs/common';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { AzureStorageService } from '../upload/azure-storage.service';
import { EditionsService } from './editions.service';

process.env.AZURE_CONTAINER = process.env.AZURE_CONTAINER || 'test';
process.env.AZURE_ACCOUNT_NAME =
  process.env.AZURE_ACCOUNT_NAME || 'devstoreaccount1';
process.env.AZURE_ACCOUNT_KEY =
  process.env.AZURE_ACCOUNT_KEY || Buffer.from('k').toString('base64');

// BG-24 (ARK-138): usa el AzureStorageService real, con su comprobación de acceso, para que la
// prueba falle si la respuesta pública vuelve a depender de Upload.isPublic.
const OLD = new Date('2026-01-01T00:00:00.000Z');
const privateOld = (id: string) => ({
  id,
  blobName: `${id}.png`,
  isPublic: false,
  createdAt: OLD,
});

describe('EditionsService: fotos de la respuesta pública (BG-24)', () => {
  const uploads: Record<string, ReturnType<typeof privateOld>> = {};
  const prisma: any = {
    edition: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    upload: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          uploads[where.id] ?? null,
      ),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  let azure: AzureStorageService;
  let service: EditionsService;
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;

  const edition = (overrides: object) => ({
    id: 7,
    title: 'Feria',
    mainPhoto: null,
    photos: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    for (const id of Object.keys(uploads)) delete uploads[id];
    azure = new AzureStorageService(prisma);
    service = new EditionsService(
      prisma,
      azure,
      {} as any,
      blobRefsPassthrough(),
    );
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('el listado devuelve mainPhotoUrl y photosUrls de uploads antiguos y no públicos', async () => {
    uploads.main = privateOld('main');
    uploads.a = privateOld('a');
    uploads.b = privateOld('b');
    prisma.edition.findMany.mockResolvedValue([
      edition({ mainPhoto: 'main', photos: ['a', 'b'] }),
    ]);
    prisma.edition.count.mockResolvedValue(1);

    const { data } = await service.findAll({
      limit: 10,
      page: 1,
      includeInactive: false,
    });
    const [item] = data as any[];

    expect(item.mainPhotoUrl).toContain('main.png');
    expect(item.mainPhotoUrl).toContain('sig=');
    expect(item.photosUrls.map((p: { id: string }) => p.id)).toEqual([
      'a',
      'b',
    ]);
    expect(item.photosUrls[0].url).toContain('a.png');
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
  });

  it('el detalle de la edición también firma las fotos antiguas y no públicas', async () => {
    uploads.main = privateOld('main');
    prisma.edition.findUnique.mockResolvedValue(edition({ mainPhoto: 'main' }));

    const result: any = await service.findOne(7);

    expect(result.mainPhotoUrl).toContain('main.png');
  });

  it('entrega URL de 1 hora, no de 3 años', async () => {
    uploads.main = privateOld('main');
    prisma.edition.findUnique.mockResolvedValue(edition({ mainPhoto: 'main' }));
    const sign = jest.spyOn(azure, 'signReadUrlById');

    await service.findOne(7);

    expect(sign).toHaveBeenCalledWith('main', 3600);
  });

  it('no abre el archivo: sigue privado y GET /upload/:id/url sin sesión sigue en 403', async () => {
    uploads.main = privateOld('main');
    prisma.edition.findUnique.mockResolvedValue(edition({ mainPhoto: 'main' }));

    await service.findOne(7);

    expect(prisma.upload.update).not.toHaveBeenCalled();
    expect(prisma.upload.updateMany).not.toHaveBeenCalled();
    await expect(azure.getReadSasUrlById('main', 60, false)).rejects.toThrow(
      'Este archivo no es público',
    );
  });

  it('si no existe el registro de una foto, registra error y devuelve las demás', async () => {
    uploads.a = privateOld('a');
    prisma.edition.findUnique.mockResolvedValue(
      edition({ mainPhoto: 'gone-main', photos: ['gone-photo', 'a'] }),
    );

    const result: any = await service.findOne(7);

    expect(result.mainPhotoUrl).toBeNull();
    expect(result.photosUrls.map((p: { id: string }) => p.id)).toEqual(['a']);
    expect(errorLog).toHaveBeenCalledTimes(2);
    const messages = errorLog.mock.calls.map(([message]) => message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('gone-main'),
        expect.stringContaining('gone-photo'),
      ]),
    );
    expect(warnLog).not.toHaveBeenCalled();
  });

  it('si falla la firma, registra error (no warn) sin tumbar la respuesta', async () => {
    uploads.a = privateOld('a');
    prisma.edition.findUnique.mockResolvedValue(
      edition({ mainPhoto: 'a', photos: ['a'] }),
    );
    jest
      .spyOn(azure, 'signReadUrlById')
      .mockRejectedValue(new Error('fallo de firma'));

    const result: any = await service.findOne(7);

    expect(result.mainPhotoUrl).toBeNull();
    expect(result.photosUrls).toEqual([]);
    expect(errorLog).toHaveBeenCalledTimes(2);
    expect(errorLog.mock.calls[0][0]).toContain('fallo de firma');
    expect(warnLog).not.toHaveBeenCalled();
  });

  it('una edición sin fotos no firma nada ni registra errores', async () => {
    prisma.edition.findUnique.mockResolvedValue(edition({}));
    const sign = jest.spyOn(azure, 'signReadUrlById');

    const result: any = await service.findOne(7);

    expect(result.mainPhotoUrl).toBeNull();
    expect(result.photosUrls).toEqual([]);
    expect(sign).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });
});
