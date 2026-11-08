import { ManualJurorAssignmentAction } from '@prisma/client';
import { rejectionNotice, releaseJurorsIfRejected } from './team-status';

/** BG-35 (ARK-158): retiro de jurados al rechazar un equipo. */
describe('releaseJurorsIfRejected', () => {
  const setup = (
    status: string,
    jurors = [{ id: 'j1', firstName: 'Ana', lastName: 'Gómez' }],
  ) => {
    const tx: any = {
      videogameStatus: { findUnique: jest.fn().mockResolvedValue({ status }) },
      team: {
        findUnique: jest.fn().mockResolvedValue({ assignedJurors: jurors }),
        update: jest.fn(),
      },
      jurorAssignmentAuditLog: { createMany: jest.fn() },
    };
    return tx;
  };

  it('sin cambio de estado no consulta ni retira nada', async () => {
    const tx = setup('RECHAZADO');
    await expect(
      releaseJurorsIfRejected(tx, 10, 'admin', undefined),
    ).resolves.toEqual([]);
    expect(tx.videogameStatus.findUnique).not.toHaveBeenCalled();
  });

  it.each(['CONFIRMADO', 'PENDIENTE'])(
    'con %s conserva los jurados',
    async (status) => {
      const tx = setup(status);
      await expect(
        releaseJurorsIfRejected(tx, 10, 'admin', 1),
      ).resolves.toEqual([]);
      expect(tx.team.update).not.toHaveBeenCalled();
      expect(tx.jurorAssignmentAuditLog.createMany).not.toHaveBeenCalled();
    },
  );

  it('al rechazar retira a todos y deja una fila por jurado en la bitácora', async () => {
    const tx = setup('RECHAZADO', [
      { id: 'j1', firstName: 'Ana', lastName: 'Gómez' },
      { id: 'j2', firstName: 'Luis', lastName: 'Díaz' },
    ]);

    const released = await releaseJurorsIfRejected(tx, 10, 'admin', 3);

    expect(released).toEqual([
      { id: 'j1', nombre: 'Ana Gómez' },
      { id: 'j2', nombre: 'Luis Díaz' },
    ]);
    expect(tx.team.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { assignedJurors: { set: [] } },
    });
    const { data } = tx.jurorAssignmentAuditLog.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      action: ManualJurorAssignmentAction.UNASSIGN,
      actorUserId: 'admin',
      teamId: 10,
      jurorId: 'j1',
      previousJurorId: 'j1',
    });
  });

  it('un equipo rechazado sin jurados no escribe nada', async () => {
    const tx = setup('RECHAZADO', []);
    await expect(releaseJurorsIfRejected(tx, 10, 'admin', 3)).resolves.toEqual(
      [],
    );
    expect(tx.team.update).not.toHaveBeenCalled();
  });
});

describe('rejectionNotice', () => {
  it('sin retiros no agrega campos a la respuesta', () => {
    expect(rejectionNotice([])).toEqual({});
  });

  it('con retiros avisa cuántos y quiénes', () => {
    const notice = rejectionNotice([{ id: 'j1', nombre: 'Ana' }]);
    expect(notice.juradosRetirados).toEqual([{ id: 'j1', nombre: 'Ana' }]);
    expect(notice.avisoAsignacion).toContain('1 jurado(s)');
  });
});
