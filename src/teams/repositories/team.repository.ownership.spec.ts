import { NotFoundException } from '@nestjs/common';
import { TeamRepository } from './team.repository';

/**
 * BG-01 — `deleteMember` debe verificar que el integrante pertenece al equipo de la
 * ruta. Si no, quien tiene permiso sobre SU equipo podría borrar integrantes de otro
 * enviando su propio `teamId` con el `memberId` ajeno.
 */
describe('TeamRepository.deleteMember — pertenencia del integrante (BG-01)', () => {
  const tx = {
    team: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    member: { findUnique: jest.fn(), delete: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const repository = new TeamRepository(prisma as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.team.findUnique.mockResolvedValue({ id: 10, userId: 'leader-1' });
    tx.user.findFirst.mockResolvedValue({
      id: 'leader-1',
      email: 'lider@uninorte.edu.co',
    });
  });

  it('elimina al integrante cuando pertenece al equipo indicado', async () => {
    tx.member.findUnique.mockResolvedValue({
      id: 55,
      teamId: 10,
      email: 'otro@uninorte.edu.co',
    });

    const result = await repository.deleteMember(10, 55);

    expect(tx.member.delete).toHaveBeenCalledWith({ where: { id: 55 } });
    expect(result?.message).toBe('Miembro eliminado exitosamente');
  });

  it('NO elimina a un integrante de OTRO equipo aunque el teamId de la ruta sea el propio', async () => {
    tx.member.findUnique.mockResolvedValue({
      id: 55,
      teamId: 999,
      email: 'ajeno@uninorte.edu.co',
    });

    await expect(repository.deleteMember(10, 55)).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.member.delete).not.toHaveBeenCalled();
  });
});
