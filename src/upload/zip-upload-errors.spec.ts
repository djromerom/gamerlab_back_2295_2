import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import JSZip from 'jszip';
import request from 'supertest';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RegistrationsOpenOrSessionGuard } from '../settings/registrations-open.guard';
import { RecaptchaService } from '../teams/services/recaptcha.service';
import { AzureStorageService } from './azure-storage.service';
import { isZipUploadType, UploadController } from './upload.controller';
import { ZipUploadAccessGuard } from './zip-upload-access.guard';

process.env.AZURE_CONTAINER = process.env.AZURE_CONTAINER || 'test';
process.env.AZURE_ACCOUNT_NAME =
  process.env.AZURE_ACCOUNT_NAME || 'devstoreaccount1';
process.env.AZURE_ACCOUNT_KEY =
  process.env.AZURE_ACCOUNT_KEY || Buffer.from('k').toString('base64');

/**
 * SP-03 (ARK-38): lo que ve un equipo al subir el .zip de su juego. Usa el `AzureStorageService`
 * real hasta el punto en que subiría a Azure (el bloque se simula) y el registro en Postgres.
 */
describe('Subida del .zip de un juego: errores y entrada (SP-03)', () => {
  const prisma = {
    upload: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'u1', ...data }),
      ),
    },
  };
  const blob = {
    stageBlock: jest.fn().mockResolvedValue({}),
    commitBlockList: jest.fn().mockResolvedValue({}),
  };
  let app: Awaited<ReturnType<typeof createApp>>;

  async function createApp() {
    const storage = new AzureStorageService(prisma as any);
    // Sin red: no se crea el contenedor de Azure al arrancar.
    jest.spyOn(storage, 'onModuleInit').mockResolvedValue(undefined);
    jest
      .spyOn((storage as any).containerClient, 'getBlockBlobClient')
      .mockReturnValue(blob);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
      ],
      controllers: [UploadController],
      providers: [
        { provide: AzureStorageService, useValue: storage },
        {
          provide: RecaptchaService,
          useValue: { verify: jest.fn().mockResolvedValue(true) },
        },
        ZipUploadAccessGuard,
      ],
    })
      .overrideGuard(RolePermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RegistrationsOpenOrSessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ZipUploadAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const nest = moduleRef.createNestApplication();
    await nest.init();
    return nest;
  }

  const zipOf = async (files: Record<string, string>) => {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files))
      zip.file(name, content);
    return zip.generateAsync({ type: 'nodebuffer' });
  };
  const upload = (
    buffer: Buffer,
    filename = 'juego.zip',
    contentType = 'application/zip',
  ) =>
    request(app.getHttpServer())
      .post('/upload/zip')
      .attach('file', buffer, { filename, contentType });

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('un zip dañado responde 400 en español (antes 500 «Internal server error»)', async () => {
    const good = await zipOf({ 'index.html': '<h1>ok</h1>' });
    // Empieza con la firma PK pero está cortado: JSZip no encuentra el directorio central.
    const broken = good.subarray(0, Math.floor(good.length / 2));

    const res = await upload(broken);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'El archivo .zip está dañado o no se pudo leer. Vuelve a comprimir el juego e inténtalo de nuevo.',
    );
    expect(prisma.upload.create).not.toHaveBeenCalled();
  });

  it('más de 100 MB responde 413 en español con el límite (antes «File too large»)', async () => {
    const big = Buffer.concat([
      Buffer.from('PK'),
      Buffer.alloc(101 * 1024 * 1024),
    ]);

    const res = await upload(big);

    expect(res.status).toBe(413);
    expect(res.body.message).toBe('El archivo supera el máximo de 100 MB.');
  }, 60000);

  it('guarda como entrada el index.html e ignora la basura de macOS (antes __MACOSX/._index.html)', async () => {
    const zip = await zipOf({
      '__MACOSX/._index.html': 'basura',
      'index.html': '<h1>juego</h1>',
      'Build/game.js': '//',
    });

    const res = await upload(zip);

    expect(res.status).toBe(201);
    expect(prisma.upload.create.mock.calls[0][0].data).toMatchObject({
      entry: 'index.html',
    });
    expect(blob.commitBlockList).toHaveBeenCalled();
  });

  it('acepta un zip con rutas ./ (revisión de #293); JSZip ya las normaliza al leer', async () => {
    const zip = await zipOf({
      './index.html': '<h1>juego</h1>',
      './Build/game.js': '//',
    });

    const res = await upload(zip);

    expect(res.status).toBe(201);
    expect(prisma.upload.create.mock.calls[0][0].data).toMatchObject({
      entry: 'index.html',
    });
  });

  it('con el nombre en mayúsculas (JUEGO.ZIP) también revisa el zip (antes quedaba sin entrada)', async () => {
    const res = await upload(await zipOf({ 'Build/a.js': '//' }), 'JUEGO.ZIP');

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('no tiene un index.html');
  });

  it('varios .html sin index.html: 400 que pide renombrar', async () => {
    const res = await upload(
      await zipOf({ 'creditos.html': '', 'juego.html': '' }),
    );

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Renombra a index.html');
  });

  it('acepta un .zip enviado como application/octet-stream y sigue revisando el contenido', async () => {
    const ok = await upload(
      await zipOf({ 'index.html': '' }),
      'juego.zip',
      'application/octet-stream',
    );
    expect(ok.status).toBe(201);

    const fake = await upload(
      Buffer.from('no soy un zip'),
      'juego.zip',
      'application/octet-stream',
    );
    expect(fake.status).toBe(400);
    expect(fake.body.message).toBe(
      'El contenido del archivo no corresponde a un .zip',
    );
  });

  it('isZipUploadType: octet-stream solo con nombre .zip', () => {
    expect(
      isZipUploadType({ mimetype: 'application/zip', originalname: 'a.bin' }),
    ).toBe(true);
    expect(
      isZipUploadType({
        mimetype: 'application/octet-stream',
        originalname: 'A.ZIP',
      }),
    ).toBe(true);
    expect(
      isZipUploadType({
        mimetype: 'application/octet-stream',
        originalname: 'a.exe',
      }),
    ).toBe(false);
    expect(
      isZipUploadType({ mimetype: 'text/plain', originalname: 'a.zip' }),
    ).toBe(false);
  });

  it('una imagen de más de 1 MB responde 413 con su propio límite', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(2 * 1024 * 1024),
    ]);

    const res = await request(app.getHttpServer())
      .post('/upload')
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(413);
    expect(res.body.message).toBe('El archivo supera el máximo de 1 MB.');
  });
});
