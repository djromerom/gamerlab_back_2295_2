import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService.login — mensajes', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const service = new AuthService(
    prisma as any,
    { get: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('«Credenciales inválidas.» cuando el usuario no existe', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login(
        { email: 'a@b.co', password: 'x' } as any,
        'PASSWORD',
        {} as any,
      ),
    ).rejects.toThrow(new UnauthorizedException('Credenciales inválidas.'));
  });
});
