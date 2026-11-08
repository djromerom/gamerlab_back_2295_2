import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StudentsService } from './students.service';
import { ROLE_IDS } from '../auth/constants/roles';

/**
 * El catálogo de permisos le da `EditMemberNrc` al administrador, por lo que el
 * servicio debe dejarlo editar los NRC de cualquier integrante (como en teams).
 * ARK-161 (BG-38): desde SP-05 los NRC los cambia solo el administrador; el líder recibe 403.
 */
describe('StudentsService.editNrc — solo administrador', () => {
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
      team: { userId: 'leader-1', edition: { status: 'ACTIVE', title: 'Edición 5' } },
    });
    // findNrcIdsByCodes (nrc-por-edicion) cruza por código: el mock debe traerlo.
    tx.nRC.findMany.mockResolvedValue([{ id: 1, code: 100 }]);
    tx.member.update.mockResolvedValue({ id: 5 });
  });

  it('rechaza al líder de su propio equipo (BG-38)', async () => {
    await expect(service.editNrc(leader, 5, [100])).rejects.toThrow(
      /Solo el administrador puede cambiar los NRC de un integrante/,
    );
    expect(tx.member.update).not.toHaveBeenCalled();
  });

  it('permite al administrador en un equipo ajeno', async () => {
    await expect(service.editNrc(admin, 5, [100])).resolves.toEqual({ id: 5 });
    expect(tx.member.update).toHaveBeenCalled();
  });

  it('ARK-130: un integrante de una edición anterior responde 400, no 500', async () => {
    tx.member.findUnique.mockResolvedValue({
      id: 5,
      team: { userId: 'leader-1', edition: { status: 'INACTIVE', title: 'Feria 4' } },
    });
    await expect(service.editNrc(admin, 5, [100])).rejects.toThrow(BadRequestException);
    expect(tx.member.update).not.toHaveBeenCalled();
  });

  it('rechaza a otro estudiante', async () => {
    await expect(service.editNrc(other, 5, [100])).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.member.update).not.toHaveBeenCalled();
  });
});
