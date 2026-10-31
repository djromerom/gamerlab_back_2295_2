import { ForbiddenException } from '@nestjs/common';
import { StudentsService } from './students.service';
import { ROLE_IDS } from '../auth/constants/roles';

/**
 * El catálogo de permisos le da `EditMemberNrc` al administrador, por lo que el
 * servicio debe dejarlo editar los NRC de cualquier integrante (como en teams).
 */
describe('StudentsService.editNrc — líder o administrador', () => {
  const tx = {
    member: { findUnique: jest.fn(), update: jest.fn() },
    nRC: { findMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
  const service = new StudentsService(prisma as any);

  const leader = { id: 'leader-1', roleId: ROLE_IDS.STUDENT } as any;
  const other = { id: 'otro', roleId: ROLE_IDS.STUDENT } as any;
  const admin = { id: 'admin-1', roleId: ROLE_IDS.ADMIN } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: any) => cb(tx));
    tx.member.findUnique.mockResolvedValue({
      id: 5,
      team: { userId: 'leader-1' },
    });
    tx.nRC.findMany.mockResolvedValue([{ id: 1 }]);
    tx.member.update.mockResolvedValue({ id: 5 });
  });

  it('permite al líder del equipo', async () => {
    await expect(service.editNrc(leader, 5, [100])).resolves.toEqual({ id: 5 });
  });

  it('permite al administrador en un equipo ajeno', async () => {
    await expect(service.editNrc(admin, 5, [100])).resolves.toEqual({ id: 5 });
    expect(tx.member.update).toHaveBeenCalled();
  });

  it('rechaza a otro estudiante', async () => {
    await expect(service.editNrc(other, 5, [100])).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.member.update).not.toHaveBeenCalled();
  });
});
