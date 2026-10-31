import { ConflictException } from '@nestjs/common';
import { ProfessorsService } from './professors.service';

describe('ProfessorsService.create', () => {
  const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
  const auth = { registerUser: jest.fn() };
  const service = new ProfessorsService(auth as any, prisma as any, {} as any);
  (service as any).professorRoleId = 3;

  beforeEach(() => jest.resetAllMocks());

  it('deja lastSignInAt en null al crear (solo se llena al iniciar sesión)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    auth.registerUser.mockResolvedValue({ id: 'u1' });
    prisma.user.update.mockResolvedValue({ id: 'u1' });

    await service.create({
      email: 'p@x.co',
      firstName: 'A',
      lastName: 'B',
    } as any);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ lastSignInAt: null }),
    });
  });

  it('el mensaje de correo duplicado sale en español', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'x' });
    await expect(service.create({ email: 'p@x.co' } as any)).rejects.toThrow(
      new ConflictException('El correo p@x.co ya está en uso.'),
    );
  });
});
