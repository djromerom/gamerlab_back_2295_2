import { StudentsService } from './students.service';
import { ROLE_IDS } from '../auth/constants/roles';

describe('StudentsService.editNrc — NRC por edición', () => {
  const tx = {
    member: { findUnique: jest.fn(), update: jest.fn() },
    nRC: { findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new StudentsService(prisma as any);
  // editNrc recibe el usuario (validaciones-back), no su id. ARK-161 (BG-38): solo el administrador.
  const leader = { id: 'admin-1', roleId: ROLE_IDS.ADMIN } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    tx.member.findUnique.mockResolvedValue({
      id: 1,
      team: { userId: 'u1', editionId: 4, edition: { status: 'ACTIVE', title: 'Edición 4' } },
    });
    tx.member.update.mockResolvedValue({ id: 1 });
  });

  it('editNrc con un código que solo existe en otra feria responde 400 con field nrc (HU-31)', async () => {
    tx.nRC.findMany.mockResolvedValue([]);

    await expect(service.editNrc(leader, 1, [9999])).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 400,
        field: 'nrc',
        message: 'Estos NRC no existen en la edición activa: 9999',
      }),
    });
    expect(tx.nRC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: { in: [9999] }, editionId: 4, isActive: true },
      }),
    );
    expect(tx.member.update).not.toHaveBeenCalled();
  });

  it('editNrc con [9999] y dos NRC 9999 (ed 3 y 4) vincula solo el de la edición del equipo', async () => {
    // La BD filtra por editionId: solo devuelve el NRC de la edición 4
    tx.nRC.findMany.mockResolvedValue([
      { id: 41, code: 9999, subjectId: 1, subject: { name: 'POO' } },
    ]);

    await service.editNrc(leader, 1, [9999]);

    expect(tx.nRC.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { code: { in: [9999] }, editionId: 4, isActive: true },
      }),
    );
    expect(tx.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nrcs: { set: [{ id: 41 }] } },
      }),
    );
  });
});
