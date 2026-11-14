import { Logger } from '@nestjs/common';
import { JurorAssignmentService } from './juror-assignment.service';

/**
 * HU-22 (ARK-84): la asignación manual registra el aviso al suplente DENTRO de la transacción
 * (solo para quien entra) y pide el correo DESPUÉS de confirmarla. Quitar no crea avisos.
 */
const ADMIN = 'admin-1';

describe('JurorAssignmentService: aviso al suplente (HU-22)', () => {
  const evaluator = (id: string) => ({
    id,
    isActive: true,
    roleId: 4,
    firstName: 'J',
    lastName: id,
    email: `${id}@test.co`,
    role: { name: 'Jurado' },
  });
  const team = (jurorIds: string[]) => ({
    id: 7,
    isActive: true,
    teamCode: 'N1-A-01',
    teamName: 'Equipo',
    editionId: 5,
    edition: { status: 'ACTIVE', title: 'Feria' },
    videogame: { id: 1, name: 'Juego', videogameStatus: { status: 'CONFIRMADO' } },
    assignedJurors: jurorIds.map(evaluator),
  });

  let tx: { team: { update: jest.Mock; findUnique: jest.Mock } };
  let prisma: {
    edition: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock; findFirst: jest.Mock };
    team: { findUnique: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let notices: { recordAssignment: jest.Mock; sendEmailAfterCommit: jest.Mock };
  let service: JurorAssignmentService;

  beforeEach(() => {
    tx = {
      team: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(team(['a'])),
      },
    };
    prisma = {
      edition: {
        findFirst: jest.fn().mockResolvedValue({ id: 5, title: 'Feria', status: 'ACTIVE' }),
      },
      user: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(evaluator(where.id)),
        ),
        findFirst: jest.fn().mockResolvedValue({ id: 'x' }),
      },
      team: { findUnique: jest.fn().mockResolvedValue(team(['a'])), findMany: jest.fn() },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    notices = {
      recordAssignment: jest.fn().mockResolvedValue(42),
      sendEmailAfterCommit: jest.fn(),
    };
    service = new JurorAssignmentService(
      prisma as any,
      { create: jest.fn().mockResolvedValue({ id: 1 }) } as any,
      {
        validate: jest.fn().mockResolvedValue({ blockers: [], warnings: [] }),
        enforce: jest.fn().mockReturnValue([]),
      } as any,
      { notifyAssignmentChanged: jest.fn() } as any,
      notices as any,
    );
    Object.assign(service, { professorRoleId: 3, jurorRoleId: 4 });
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('assign: registra el aviso con el cliente de la transacción y envía el correo después', async () => {
    await service.assign('b', 7, ADMIN);

    expect(notices.recordAssignment).toHaveBeenCalledWith(tx, {
      jurorId: 'b',
      teamIds: [7],
      editionId: 5,
    });
    expect(notices.sendEmailAfterCommit).toHaveBeenCalledWith([42]);
    expect(notices.sendEmailAfterCommit.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.$transaction.mock.invocationCallOrder[0],
    );
  });

  it('reassign: solo el jurado que entra puede recibir aviso', async () => {
    await service.reassign('a', 'b', 7, ADMIN);

    expect(notices.recordAssignment).toHaveBeenCalledTimes(1);
    expect((notices.recordAssignment.mock.calls as unknown[][])[0][1]).toEqual({
      jurorId: 'b',
      teamIds: [7],
      editionId: 5,
    });
    expect(notices.sendEmailAfterCommit).toHaveBeenCalledWith([42]);
  });

  it('jurado que no es suplente: no hay aviso que enviar', async () => {
    notices.recordAssignment.mockResolvedValue(null);

    await service.assign('b', 7, ADMIN);

    expect(notices.sendEmailAfterCommit).toHaveBeenCalledWith([null]);
  });

  it('si la transacción falla no se envía correo', async () => {
    prisma.$transaction.mockRejectedValue(new Error('db'));

    await expect(service.assign('b', 7, ADMIN)).rejects.toBeDefined();
    expect(notices.sendEmailAfterCommit).not.toHaveBeenCalled();
  });

  it('unassign no crea avisos', async () => {
    await service.unassign('a', 7, ADMIN);

    expect(notices.recordAssignment).not.toHaveBeenCalled();
    expect(notices.sendEmailAfterCommit).not.toHaveBeenCalled();
  });
});
