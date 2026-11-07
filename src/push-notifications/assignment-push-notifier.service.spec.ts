import { Logger } from '@nestjs/common';
import { AssignmentPushNotifier } from './assignment-push-notifier.service';
import {
  ARRIVAL_REMINDER_NOTICE,
  ASSIGNMENT_CHANGED_NOTICE,
  PENDING_EVALUATIONS_NOTICE,
} from './push-messages';
import { buildPushNotice } from './push-notice';

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('AssignmentPushNotifier (HU-37)', () => {
  let sender: { isEnabled: jest.Mock; sendToUsers: jest.Mock };
  let notifier: AssignmentPushNotifier;
  let error: jest.SpyInstance;

  beforeEach(() => {
    sender = {
      isEnabled: jest.fn().mockReturnValue(true),
      sendToUsers: jest.fn().mockResolvedValue({}),
    };
    notifier = new AssignmentPushNotifier(sender as any);
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
