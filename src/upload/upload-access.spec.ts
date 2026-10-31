import { ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AzureStorageService } from './azure-storage.service';
import { UploadController } from './upload.controller';
import { ZipUploadAccessGuard } from './zip-upload-access.guard';
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
  const guard = new ZipUploadAccessGuard(recaptcha);
  beforeEach(() => recaptcha.verify.mockReset());

  it('con sesión pasa sin reCAPTCHA', async () => {
    await expect(guard.canActivate(ctx({ user: { id: 1 }, headers: {} }))).resolves.toBe(true);
    expect(recaptcha.verify).not.toHaveBeenCalled();
  });

  it('sin sesión ni token -> 401', async () => {
    recaptcha.verify.mockResolvedValue(false);
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sin sesión con token inválido -> 401', async () => {
    recaptcha.verify.mockResolvedValue(false);
    await expect(guard.canActivate(ctx({ headers: { 'x-recaptcha-token': 'mal' } }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sin sesión con token válido pasa', async () => {
    recaptcha.verify.mockResolvedValue(true);
    await expect(guard.canActivate(ctx({ headers: { 'x-recaptcha-token': 'ok' } }))).resolves.toBe(true);
    expect(recaptcha.verify).toHaveBeenCalledWith('ok');
  });
});

describe('límites del zip', () => {
  it('zipUpload es 3 por 10 minutos', () => {
    expect(PUBLIC_LIMITS.zipUpload).toEqual({ limit: 3, ttl: 10 * 60_000 });
  });

  it('el tope de tamaño del interceptor del zip es 100 MB', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'upload.controller.ts'), 'utf8');
    expect(src).toContain('1024 * 1024 * 100');
    expect(src).not.toContain('1024 * 1024 * 500');
  });
});
