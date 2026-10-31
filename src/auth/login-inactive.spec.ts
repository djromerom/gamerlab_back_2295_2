import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

/** ARK-SP1 (#3): un usuario desactivado (borrado lógico) no puede iniciar sesión. */
describe('AuthService.login con usuario desactivado', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('rechaza con 401 y no emite cookies', async () => {
    const user = {
      id: 'u1',
      email: 'jurado@uninorte.edu.co',
      authMethod: 'PASSWORD',
      password: await bcrypt.hash('Pass1234', 4),
      isActive: false,
    };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    };
    const service = new AuthService(
      prisma,
      { get: (_k: string, d?: unknown) => d } as unknown as ConfigService,
      {} as any,
      new JwtService({ secret: 's' }),
      {} as any,
      {} as any,
    );
    const res: any = { cookie: jest.fn(), clearCookie: jest.fn() };

    await expect(
      service.login(
        { email: user.email, password: 'Pass1234' } as any,
        'PASSWORD',
        res,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
