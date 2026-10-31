import { ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Test } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { RecaptchaService } from '../teams/services/recaptcha.service';
import { AzureStorageService } from './azure-storage.service';
import { UploadController } from './upload.controller';
import { ZipUploadAccessGuard } from './zip-upload-access.guard';
import { RegistrationsOpenOrSessionGuard } from '../settings/registrations-open.guard';
import { PUBLIC_LIMITS } from '../common/throttle/public-throttle';

process.env.AZURE_CONTAINER = process.env.AZURE_CONTAINER || 'test';
process.env.AZURE_ACCOUNT_NAME = process.env.AZURE_ACCOUNT_NAME || 'devstoreaccount1';
process.env.AZURE_ACCOUNT_KEY = process.env.AZURE_ACCOUNT_KEY || Buffer.from('k').toString('base64');

function makeService(record: any) {
  const prisma: any = { upload: { findUnique: jest.fn().mockResolvedValue(record) } };
  return new AzureStorageService(prisma);
}

describe('AzureStorageService.getReadSasUrlById (I5)', () => {
  const rec = { id: 'u1', blobName: 'b.png', isPublic: false, createdAt: new Date(0) };

  it('id inexistente -> 404', async () => {
    await expect(makeService(null).getReadSasUrlById('x', 60, false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('anónimo + archivo privado viejo -> 403', async () => {
    const old = { ...rec, createdAt: new Date(Date.now() - 16 * 60_000) };
    await expect(makeService(old).getReadSasUrlById('u1', 60, false)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('anónimo + archivo privado recién subido -> URL', async () => {
    const fresh = { ...rec, createdAt: new Date(Date.now() - 60_000) };
    const r = await makeService(fresh).getReadSasUrlById('u1', 60, false);
    expect(r.url).toContain('b.png');
  });

  it('con sesión + archivo privado viejo -> URL', async () => {
    const old = { ...rec, createdAt: new Date(Date.now() - 3600_000) };
    const r = await makeService(old).getReadSasUrlById('u1', 60, true);
    expect(r.url).toContain('b.png');
  });

  it('anónimo + público -> URL', async () => {
    const pub = { ...rec, isPublic: true, createdAt: new Date(0) };
    const r = await makeService(pub).getReadSasUrlById('u1', 60, false);
    expect(r.url).toContain('b.png');
  });

  it('ttl entre 0 y 60 s se sube a 60 s', async () => {
    const before = Date.now();
    const r = await makeService({ ...rec, isPublic: true }).getReadSasUrlById('u1', 5, true);
    const delta = new Date(r.expiresAt).getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(59 * 1000);
    expect(delta).toBeLessThanOrEqual(62 * 1000);
  });

  it('ttl grande se conserva (3 años) y se topa en 3 años', async () => {
    const pub = { ...rec, isPublic: true, createdAt: new Date(0) };
    const svc = makeService(pub);
    const before = Date.now();
    const a = await svc.getReadSasUrlById('u1', 90000000, true);
    expect(new Date(a.expiresAt).getTime() - before).toBeGreaterThan(89000000 * 1000);
    const b = await svc.getReadSasUrlById('u1', 9e12, true);
    expect(new Date(b.expiresAt).getTime() - before).toBeLessThanOrEqual(94608000 * 1000 + 2000);
  });
});

describe('UploadController.getSignedUrl', () => {
  it('ttl inválido usa el valor por defecto; válido se pasa; gigante se topa', async () => {
    const svc: any = { getReadSasUrlById: jest.fn().mockResolvedValue({}) };
    const ctrl = new UploadController(svc);
    await ctrl.getSignedUrl('u1', undefined, { user: { id: 1 } } as any);
    expect(svc.getReadSasUrlById).toHaveBeenLastCalledWith('u1', 94608000, true);
    await ctrl.getSignedUrl('u1', '-5', {} as any);
    expect(svc.getReadSasUrlById).toHaveBeenLastCalledWith('u1', 94608000, false);
    await ctrl.getSignedUrl('u1', 'abc', {} as any);
    expect(svc.getReadSasUrlById).toHaveBeenLastCalledWith('u1', 94608000, false);
    await ctrl.getSignedUrl('u1', '7200', {} as any);
    expect(svc.getReadSasUrlById).toHaveBeenLastCalledWith('u1', 7200, false);
    await ctrl.getSignedUrl('u1', '9000000000000', {} as any);
    expect(svc.getReadSasUrlById).toHaveBeenLastCalledWith('u1', 94608000, false);
  });
});

describe('ZipUploadAccessGuard (I6)', () => {
  const ctx = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;
  const recaptcha: any = { verify: jest.fn() };
  const makeStorage = () => {
    const hits = new Map<string, number>();
    return {
      increment: jest.fn(async (key: string, _ttl: number, limit: number) => {
        const n = (hits.get(key) ?? 0) + 1;
        hits.set(key, n);
        return { totalHits: n, timeToExpire: 600, isBlocked: n > limit, timeToBlockExpire: 0 };
      }),
    };
  };
  let storage: ReturnType<typeof makeStorage>;
  let guard: ZipUploadAccessGuard;
  beforeEach(() => {
    recaptcha.verify.mockReset();
    storage = makeStorage();
    guard = new ZipUploadAccessGuard(recaptcha, storage as any);
  });

  it('administrador con sesión sube 5 zips seguidos sin 429 ni reCAPTCHA', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(guard.canActivate(ctx({ user: { id: 1 }, ip: '1.1.1.1', headers: {} }))).resolves.toBe(true);
    }
    expect(recaptcha.verify).not.toHaveBeenCalled();
    expect(storage.increment).not.toHaveBeenCalled();
  });

  it('sin sesión ni token -> 401 y no consume cupo', async () => {
    await expect(guard.canActivate(ctx({ ip: '1.1.1.1', headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(storage.increment).not.toHaveBeenCalled();
  });

  it('sin sesión con token inválido -> 401', async () => {
    recaptcha.verify.mockResolvedValue(false);
    await expect(guard.canActivate(ctx({ ip: '1.1.1.1', headers: { 'x-recaptcha-token': 'mal' } }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('anónimo con token válido: el 4.º en 10 minutos -> 429', async () => {
    recaptcha.verify.mockResolvedValue(true);
    const req = () => ctx({ ip: '1.1.1.1', headers: { 'x-recaptcha-token': 'ok' } });
    for (let i = 0; i < 3; i++) await expect(guard.canActivate(req())).resolves.toBe(true);
    await expect(guard.canActivate(req())).rejects.toMatchObject({ status: 429 });
    expect(storage.increment.mock.calls[0].slice(1, 3)).toEqual([10 * 60_000, 3]);
  });

  it('el contador es por IP', async () => {
    recaptcha.verify.mockResolvedValue(true);
    const req = (ip: string) => ctx({ ip, headers: { 'x-recaptcha-token': 'ok' } });
    for (let i = 0; i < 3; i++) await guard.canActivate(req('1.1.1.1'));
    await expect(guard.canActivate(req('2.2.2.2'))).resolves.toBe(true);
  });
});

async function NestFactory_create() {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
    controllers: [UploadController],
    providers: [
      { provide: AzureStorageService, useValue: { uploadFile: jest.fn() } },
      { provide: RecaptchaService, useValue: { verify: jest.fn().mockResolvedValue(true) } },
      ZipUploadAccessGuard,
    ],
  })
    .overrideGuard(RolePermissionGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(OptionalJwtAuthGuard)
    .useValue({ canActivate: () => true })
    // Inscripciones (inscripciones-back): se prueban en registrations-routes.spec.ts.
    .overrideGuard(RegistrationsOpenOrSessionGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('límites del zip', () => {
  it('zipUpload es 3 por 10 minutos', () => {
    expect(PUBLIC_LIMITS.zipUpload).toEqual({ limit: 3, ttl: 10 * 60_000 });
  });

  it('el interceptor del zip rechaza con 413 un cuerpo mayor a 100 MB', async () => {
    const app = await NestFactory_create();
    try {
      const big = Buffer.concat([Buffer.from('PK'), Buffer.alloc(101 * 1024 * 1024)]);
      const res = await request(app.getHttpServer())
        .post('/upload/zip')
        .set('x-recaptcha-token', 'ok')
        .attach('file', big, { filename: 'g.zip', contentType: 'application/zip' });
      expect(res.status).toBe(413);
    } finally {
      await app.close();
    }
  }, 60000);
});
