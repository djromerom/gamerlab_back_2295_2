import { InternalServerErrorException, Logger } from '@nestjs/common';
import { AssignmentPushNotifier } from '../../push-notifications/assignment-push-notifier.service';
import { ASSIGNMENT_CHANGED_NOTICE } from '../../push-notifications/push-messages';
import { JurorAssignmentService } from './juror-assignment.service';

/**
 * HU-37: el aviso de asignación sale solo después de confirmar la transacción, a lo sumo una vez
 * por jurado, y un fallo de envío nunca afecta a la asignación. Usa el notificador real.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));
const ADMIN = 'admin-1';

describe('JurorAssignmentService: aviso push (HU-37)', () => {
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
    teamName: 'Nombre secreto',
    editionId: 5,
    edition: { status: 'ACTIVE', title: 'Feria' },
    videogame: { id: 1, name: 'Juego', videogameStatus: { status: 'CONFIRMADO' } },
    assignedJurors: jurorIds.map(evaluator),
  });

  let prisma: {
    edition: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    team: { findUnique: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let validation: { validate: jest.Mock; enforce: jest.Mock };
  let sender: { isEnabled: jest.Mock; sendToUsers: jest.Mock };
  let service: JurorAssignmentService;

  beforeEach(() => {
    const tx = {
      team: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(team(['a'])),
      },
    };
    prisma = {
      edition: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 5, title: 'Feria', status: 'ACTIVE' }),
      },
      user: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(evaluator(where.id)),
        ),
        findFirst: jest.fn().mockResolvedValue({ id: 'x' }),
        // El notificador filtra por jurados de la edición: aquí todos lo son.
        findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(where.id.in.map((id) => ({ id }))),
        ),
      },
      team: {
        findUnique: jest.fn().mockResolvedValue(team(['a'])),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    validation = {
      validate: jest.fn().mockResolvedValue({ blockers: [], warnings: [] }),
      enforce: jest.fn().mockReturnValue([]),
    };
    sender = {
      isEnabled: jest.fn().mockReturnValue(true),
      sendToUsers: jest.fn().mockResolvedValue({}),
    };
    service = new JurorAssignmentService(
      prisma as any,
      { create: jest.fn().mockResolvedValue({ id: 1 }) } as any,
      validation as any,
      new AssignmentPushNotifier(prisma as any, sender as any),
      // HU-22 (ARK-84): avisos a suplentes (no aplican en estas pruebas).
      { recordAssignment: async () => null, sendEmailAfterCommit: () => undefined } as any,
    );
    Object.assign(service, { professorRoleId: 3, jurorRoleId: 4 });
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  const sentTo = async () => {
    await flush();
    return (sender.sendToUsers.mock.calls as [string[]][]).map(([ids]) => ids);
  };

  describe('avisa al jurado afectado, después de la transacción', () => {
    it('assign', async () => {
      await service.assign('b', 7, ADMIN);

      expect(await sentTo()).toEqual([['b']]);
      expect(sender.sendToUsers.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
    });

    it('reassign avisa al que sale y al que entra, en un solo envío', async () => {
      await service.reassign('a', 'b', 7, ADMIN);

      expect(await sentTo()).toEqual([['a', 'b']]);
    });

    it('unassign', async () => {
      await service.unassign('a', 7, ADMIN);

      expect(await sentTo()).toEqual([['a']]);
    });

    it('unassignAll envía una sola vez y sin repetir jurados', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 1, assignedJurors: [{ id: 'a' }, { id: 'b' }] },
        { id: 2, assignedJurors: [{ id: 'a' }, { id: 'c' }] },
      ]);

      await service.unassignAll(ADMIN);

      expect(await sentTo()).toEqual([['a', 'b', 'c']]);
    });

    it('unassignAllFromEvaluator envía una sola vez aunque quite varios equipos', async () => {
      prisma.team.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

      await service.unassignAllFromEvaluator('a', ADMIN);

      expect(await sentTo()).toEqual([['a']]);
    });

    it('el aviso no lleva el nombre del equipo ni del jurado', async () => {
      await service.assign('b', 7, ADMIN);
      await flush();

      expect(sender.sendToUsers).toHaveBeenCalledWith(
        ['b'],
        ASSIGNMENT_CHANGED_NOTICE,
      );
      expect(JSON.stringify(ASSIGNMENT_CHANGED_NOTICE)).not.toContain(
        'Nombre secreto',
      );
    });
  });

  describe('no avisa si la operación no se confirmó', () => {
    const rollback = () =>
      prisma.$transaction.mockRejectedValue(new Error('revertida'));

    it.each<[string, () => Promise<unknown>]>([
      ['assign', () => service.assign('b', 7, ADMIN)],
      ['reassign', () => service.reassign('a', 'b', 7, ADMIN)],
      ['unassign', () => service.unassign('a', 7, ADMIN)],
      [
        'unassignAllFromEvaluator',
        () => service.unassignAllFromEvaluator('a', ADMIN),
      ],
      ['unassignAll', () => service.unassignAll(ADMIN)],
    ])('%s: la transacción se revierte', async (_name, run) => {
      prisma.team.findMany.mockResolvedValue([
        { id: 1, assignedJurors: [{ id: 'a' }] },
      ]);
      rollback();

      await expect(run()).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(await sentTo()).toEqual([]);
    });

    it('assign: la validación lo bloquea', async () => {
      validation.enforce.mockImplementation(() => {
        throw new Error('bloqueado');
      });

      await expect(service.assign('b', 7, ADMIN)).rejects.toThrow();

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(await sentTo()).toEqual([]);
    });

    it('unassignAllFromEvaluator: el jurado no tenía equipos', async () => {
      prisma.team.findMany.mockResolvedValue([]);

      await service.unassignAllFromEvaluator('a', ADMIN);

      expect(await sentTo()).toEqual([]);
    });
  });

  describe('un problema del aviso no afecta a la asignación', () => {
    it('el envío falla: la asignación responde bien', async () => {
      sender.sendToUsers.mockRejectedValue(new Error('push caído'));

      await expect(service.assign('b', 7, ADMIN)).resolves.toMatchObject({
        message: 'Jurado asignado correctamente al equipo.',
      });
      await flush();
    });

    it('el envío nunca termina: la asignación no lo espera', async () => {
      sender.sendToUsers.mockReturnValue(new Promise(() => undefined));

      await expect(service.unassign('a', 7, ADMIN)).resolves.toMatchObject({
        message: 'Evaluador desasignado correctamente del equipo.',
      });
      await flush();
    });

    it('sin claves VAPID: la asignación responde bien y no se intenta enviar', async () => {
      sender.isEnabled.mockReturnValue(false);

      await expect(service.assign('b', 7, ADMIN)).resolves.toBeDefined();

      expect(await sentTo()).toEqual([]);
    });
  });
});
