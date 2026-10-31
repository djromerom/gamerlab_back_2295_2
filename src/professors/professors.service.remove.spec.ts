import { Logger, NotFoundException } from '@nestjs/common';
import { ProfessorsService } from './professors.service';

/**
 * ARK-SP1 (#3): borrar un profesor es un borrado lógico (isActive=false);
 * nunca se elimina la fila.
 */
describe('ProfessorsService.remove (borrado lógico)', () => {
  const professorRoleId = 3;
  const baseProfessor = {
    id: 'prof-1',
    email: 'profe@uninorte.edu.co',
    roleId: professorRoleId,
    isActive: true,
  };

  let prisma: any;
  let auth: any;
  let service: ProfessorsService;

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((arg: any) => Promise.all(arg)),
    };
    auth = { invalidateUserProfileCache: jest.fn() };
    service = new ProfessorsService(auth, prisma, {} as any);
    (service as any).professorRoleId = professorRoleId;
  });

  it('no llama a prisma.user.delete', async () => {
    prisma.user.findUnique.mockResolvedValue(baseProfessor);
    prisma.user.update.mockResolvedValue({ ...baseProfessor, isActive: false });

    await service.remove(baseProfessor.id);

    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('hace update({ isActive: false }) y devuelve el usuario desactivado', async () => {
    prisma.user.findUnique.mockResolvedValue(baseProfessor);
    prisma.user.update.mockResolvedValue({ ...baseProfessor, isActive: false });

    const result = await service.remove(baseProfessor.id);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseProfessor.id },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
  });

  it('invalida la caché del perfil', async () => {
    prisma.user.findUnique.mockResolvedValue(baseProfessor);
    prisma.user.update.mockResolvedValue({ ...baseProfessor, isActive: false });

    await service.remove(baseProfessor.id);

    expect(auth.invalidateUserProfileCache).toHaveBeenCalledWith(
      baseProfessor.id,
    );
  });

  it('lanza 404 si el usuario no existe', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.remove('no-existe')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('lanza 404 si el usuario es de otro rol', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseProfessor, roleId: 99 });

    await expect(service.remove(baseProfessor.id)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('findOne de un profesor desactivado lanza 404', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseProfessor,
      isActive: false,
    });

    await expect(service.findOne(baseProfessor.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('el listado excluye inactivos salvo que se pida includeInactive', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll(false, 10, 1);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roleId: professorRoleId, isActive: true },
      }),
    );
  });
});
