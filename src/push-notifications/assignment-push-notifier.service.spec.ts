import { Logger } from '@nestjs/common';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { AssignmentPushNotifier } from './assignment-push-notifier.service';
import {
  ARRIVAL_REMINDER_NOTICE,
  ASSIGNMENT_CHANGED_NOTICE,
  PENDING_EVALUATIONS_NOTICE,
} from './push-messages';
import { buildPushNotice } from './push-notice';

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('AssignmentPushNotifier (HU-37)', () => {
  let prisma: {
    edition: { findFirst: jest.Mock };
    user: { findMany: jest.Mock };
  };
  let sender: { isEnabled: jest.Mock; sendToUsers: jest.Mock };
  let notifier: AssignmentPushNotifier;
  let error: jest.SpyInstance;

  beforeEach(() => {
    sender = {
      isEnabled: jest.fn().mockReturnValue(true),
      sendToUsers: jest.fn().mockResolvedValue({}),
    };
    prisma = {
      edition: { findFirst: jest.fn().mockResolvedValue({ id: 5 }) },
      // Por defecto, todos los pedidos son jurados de la edición.
      user: {
        findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(where.id.in.map((id) => ({ id }))),
        ),
      },
    };
    notifier = new AssignmentPushNotifier(prisma as any, sender as any);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('envía a lo sumo un aviso por jurado', async () => {
    notifier.notifyAssignmentChanged(['a', 'b', 'a', 'a']);
    await flush();

    expect(sender.sendToUsers).toHaveBeenCalledTimes(1);
    expect(sender.sendToUsers).toHaveBeenCalledWith(
      ['a', 'b'],
      ASSIGNMENT_CHANGED_NOTICE,
    );
  });

  it('solo avisa a los jurados de la edición activa', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'b' }]);

    notifier.notifyAssignmentChanged(['a', 'b']);
    await flush();

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: jurorsOfEdition(5, ['a', 'b']),
      select: { id: true },
    });
    expect(sender.sendToUsers).toHaveBeenCalledWith(
      ['b'],
      ASSIGNMENT_CHANGED_NOTICE,
    );
  });

  it('si ninguno es jurado de la edición, no envía', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    notifier.notifyAssignmentChanged(['a']);
    await flush();

    expect(sender.sendToUsers).not.toHaveBeenCalled();
  });

  it('sin edición activa no envía ni registra un error', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);

    notifier.notifyAssignmentChanged(['a']);
    await flush();

    expect(sender.sendToUsers).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('si falla la consulta de jurados, no lanza y no envía', async () => {
    prisma.user.findMany.mockRejectedValue(new Error('BD caída'));

    expect(() => notifier.notifyAssignmentChanged(['a'])).not.toThrow();
    await flush();

    expect(sender.sendToUsers).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('no devuelve nada que esperar, aunque el envío nunca termine', () => {
    sender.sendToUsers.mockReturnValue(new Promise(() => undefined));

    expect(notifier.notifyAssignmentChanged(['a'])).toBeUndefined();
  });

  it('si el envío falla, no lanza ni deja una promesa rechazada', async () => {
    sender.sendToUsers.mockRejectedValue(new Error('BD caída'));

    expect(() => notifier.notifyAssignmentChanged(['a'])).not.toThrow();
    await flush();

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('si el envío lanza de forma síncrona, tampoco se propaga', async () => {
    sender.sendToUsers.mockImplementation(() => {
      throw new Error('fallo');
    });

    expect(() => notifier.notifyAssignmentChanged(['a'])).not.toThrow();
    await flush();

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('sin claves VAPID no intenta enviar', async () => {
    sender.isEnabled.mockReturnValue(false);

    notifier.notifyAssignmentChanged(['a']);
    await flush();

    expect(sender.sendToUsers).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('sin jurados afectados no intenta enviar', async () => {
    notifier.notifyAssignmentChanged([]);
    await flush();

    expect(sender.sendToUsers).not.toHaveBeenCalled();
  });

  it.each([
    ['asignación', ASSIGNMENT_CHANGED_NOTICE],
    ['llegada', ARRIVAL_REMINDER_NOTICE],
    ['pendientes', PENDING_EVALUATIONS_NOTICE],
  ])('el texto de %s pasa el filtro de avisos', (_name, notice) => {
    expect(() => buildPushNotice(notice)).not.toThrow();
  });
});
