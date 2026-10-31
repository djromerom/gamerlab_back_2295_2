import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('registerUser: fallo del correo de verificación', () => {
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  it('un sendVerificationEmail que rechaza no produce unhandledRejection y el registro responde bien', async () => {
    const user = { id: 'u1', email: 'x@y.co' };
    const prisma = {
      $transaction: jest
        .fn()
        .mockResolvedValue({ user, verificationToken: 'tok' }),
    };
    const config = { get: jest.fn((_k: string, d?: unknown): unknown => d) };
    const service = new AuthService(
      prisma as any,
      config as any,
      {} as any,
      new JwtService({ secret: 's' }),
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service, 'sendVerificationEmail')
      .mockRejectedValue(new Error('ACS caído'));
    const errSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await expect(
        service.registerUser({ email: 'x@y.co' } as any),
      ).resolves.toBe(user);
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('ACS caído'));
      expect(errSpy.mock.calls.flat().join(' ')).not.toContain('x@y.co');
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
