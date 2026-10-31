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
  const rec = { id: 'u1', blobName: 'b.png', isPublic: false };

  it('id inexistente -> 404', async () => {
    await expect(makeService(null).getReadSasUrlById('x', 60, false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archivo no público sin sesión -> 403', async () => {
    await expect(makeService(rec).getReadSasUrlById('u1', 60, false)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('archivo no público con sesión -> URL', async () => {
    const r = await makeService(rec).getReadSasUrlById('u1', 60, true);
    expect(r.url).toContain('b.png');
  });

  it('archivo público sin sesión -> URL', async () => {
    const r = await makeService({ ...rec, isPublic: true }).getReadSasUrlById('u1', 60, false);
    expect(r.url).toContain('b.png');
  });

  it('ttl mayor al máximo se recorta a 3600 s', async () => {
    const before = Date.now();
    const r = await makeService(rec).getReadSasUrlById('u1', 100000000, true);
    const delta = new Date(r.expiresAt).getTime() - before;
    expect(delta).toBeLessThanOrEqual(3600 * 1000 + 2000);
    expect(delta).toBeGreaterThan(3500 * 1000);
  });
});

describe('UploadController.getSignedUrl', () => {
  it('sin ttl usa el máximo y pasa si hay sesión', async () => {
    const svc: any = { getReadSasUrlById: jest.fn().mockResolvedValue({}) };
    const ctrl = new UploadController(svc);
    await ctrl.getSignedUrl('u1', undefined, { user: { id: 1 } } as any);
    expect(svc.getReadSasUrlById).toHaveBeenCalledWith('u1', 3600, true);
    await ctrl.getSignedUrl('u1', '999999', {} as any);
    expect(svc.getReadSasUrlById).toHaveBeenLastCalledWith('u1', 3600, false);
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
