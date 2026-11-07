import { BadRequestException, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PushSenderService } from './push-sender.service';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));

const send = webpush.sendNotification as jest.Mock;
const notice = { title: 'Aviso', body: 'Mensaje' };

const sub = (id: number, userId: string) => ({
  id,
  userId,
  endpoint: `https://fcm.googleapis.com/fcm/send/secreto-${id}`,
  p256dh: `p256dh-${id}`,
  auth: `auth-${id}`,
});

describe('PushSenderService (HU-37)', () => {
  let prisma: {
    pushSubscription: { findMany: jest.Mock; deleteMany: jest.Mock };
  };
  let enabled: boolean;
  let service: PushSenderService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    enabled = true;
    prisma = {
      pushSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new PushSenderService(
      prisma as any,
      { isEnabled: () => enabled } as any,
    );
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('sin claves VAPID no consulta ni envía, y lo informa', async () => {
    enabled = false;

    const result = await service.sendToUsers(['u1'], notice);

    expect(result.enabled).toBe(false);
    expect(result.totals.sent).toBe(0);
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('sin usuarios no consulta nada', async () => {
    const result = await service.sendToUsers([], notice);

    expect(result.results).toEqual([]);
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('solo lee suscripciones activas de usuarios activos, sin repetir usuarios', async () => {
    await service.sendToUsers(['u1', 'u1', 'u2'], notice);

    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: { in: ['u1', 'u2'] },
          isActive: true,
          user: { isActive: true },
        },
      }),
    );
  });

  it('envía a cada dispositivo solo título, mensaje y ruta', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([sub(1, 'u1')]);
    send.mockResolvedValue({ statusCode: 201 });

    await service.sendToUsers(['u1'], { ...notice, url: '/jurado' });

    const [subscription, payload, options] = send.mock.calls[0] as [
      unknown,
      string,
      { TTL: number },
    ];
    expect(subscription).toEqual({
      endpoint: sub(1, 'u1').endpoint,
      keys: { p256dh: 'p256dh-1', auth: 'auth-1' },
    });
    expect(JSON.parse(payload)).toEqual({
      title: 'Aviso',
      body: 'Mensaje',
      url: '/jurado',
    });
    expect(options.TTL).toBeGreaterThan(0);
  });

  it.each([404, 410])(
    'elimina la suscripción cuando el servicio responde %i',
    async (statusCode) => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        sub(1, 'u1'),
        sub(2, 'u1'),
      ]);
      send
        .mockRejectedValueOnce({ statusCode })
        .mockResolvedValueOnce({ statusCode: 201 });

      const result = await service.sendToUsers(['u1'], notice);

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [1] } },
      });
      expect(result.results).toEqual([
        { userId: 'u1', devices: 2, sent: 1, expired: 1, failed: 0 },
      ]);
    },
  );

  it.each([401, 403, 429, 500, 503])(
    'no elimina la suscripción si responde %i: puede volver a funcionar',
    async (statusCode) => {
      prisma.pushSubscription.findMany.mockResolvedValue([sub(1, 'u1')]);
      send.mockRejectedValueOnce({ statusCode });

      const result = await service.sendToUsers(['u1'], notice);

      expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
      expect(result.totals.failed).toBe(1);
    },
  );

  it('un dispositivo que falla no detiene a los demás y cada jurado tiene su fila', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([
      sub(1, 'u1'),
      sub(2, 'u2'),
    ]);
    send
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValueOnce({ statusCode: 201 });

    const result = await service.sendToUsers(['u1', 'u2', 'u3'], notice);

    expect(result.results).toEqual([
      { userId: 'u1', devices: 1, sent: 0, expired: 0, failed: 1 },
      { userId: 'u2', devices: 1, sent: 1, expired: 0, failed: 0 },
      { userId: 'u3', devices: 0, sent: 0, expired: 0, failed: 0 },
    ]);
    expect(result.totals).toEqual({
      devices: 2,
      sent: 1,
      expired: 0,
      failed: 1,
    });
  });

  it('llega a todos los dispositivos aunque superen un lote', async () => {
    const many = Array.from({ length: 60 }, (_, i) => sub(i + 1, 'u1'));
    prisma.pushSubscription.findMany.mockResolvedValue(many);
    send.mockResolvedValue({ statusCode: 201 });

    const result = await service.sendToUsers(['u1'], notice);

    expect(send).toHaveBeenCalledTimes(60);
    expect(result.totals.sent).toBe(60);
  });

  it('si falla la limpieza, el envío igual responde', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([sub(1, 'u1')]);
    send.mockRejectedValueOnce({ statusCode: 410 });
    prisma.pushSubscription.deleteMany.mockRejectedValueOnce(new Error('BD'));

    await expect(service.sendToUsers(['u1'], notice)).resolves.toMatchObject({
      totals: { expired: 1 },
    });
  });

  it('no registra la dirección del dispositivo cuando falla', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([sub(1, 'u1')]);
    send.mockRejectedValueOnce({
      statusCode: 500,
      endpoint: sub(1, 'u1').endpoint,
    });

    await service.sendToUsers(['u1'], notice);

    expect(JSON.stringify(warn.mock.calls)).not.toContain('secreto-1');
  });

  it('rechaza un aviso con datos sensibles aunque no venga de la ruta', async () => {
    await expect(
      service.sendToUsers(['u1'], { title: 'x', body: 'a@b.co' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });
});
