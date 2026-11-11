import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { PushSubscriptionsService } from './push-subscriptions.service';

const dto: SubscribePushDto = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
};

describe('PushSubscriptionsService (HU-37)', () => {
  let prisma: {
    pushSubscription: {
      upsert: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let vapid: { isEnabled: jest.Mock; getPublicKey: jest.Mock };
  let service: PushSubscriptionsService;

  beforeEach(() => {
    prisma = {
      pushSubscription: {
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    vapid = {
      isEnabled: jest.fn().mockReturnValue(true),
      getPublicKey: jest.fn().mockReturnValue('clave-publica'),
    };
    service = new PushSubscriptionsService(prisma as any, vapid as any);
  });

  describe('subscribe', () => {
    it('guarda el dispositivo a nombre del usuario de la sesión', async () => {
      const result = await service.subscribe('u1', dto);

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: dto.endpoint },
        create: {
          userId: 'u1',
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
        },
        update: {
          userId: 'u1',
          isActive: true,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
        },
        select: { id: true },
      });
      expect(result).toEqual({ subscribed: true, devices: 1 });
    });

    it('no devuelve la dirección ni las claves', async () => {
      const result = await service.subscribe('u1', dto);

      expect(JSON.stringify(result)).not.toContain('fcm.googleapis.com');
    });

    it('rechaza un host que no es un servicio de push y no guarda nada', async () => {
      await expect(
        service.subscribe('u1', {
          ...dto,
          endpoint: 'https://169.254.169.254/latest/meta-data',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('solo desactiva, y solo si el dispositivo es del usuario de la sesión', async () => {
      prisma.pushSubscription.count.mockResolvedValue(0);

      const result = await service.unsubscribe('u1', dto.endpoint);

      expect(prisma.pushSubscription.updateMany).toHaveBeenCalledWith({
        where: { endpoint: dto.endpoint, userId: 'u1', isActive: true },
        data: { isActive: false },
      });
      expect(result).toEqual({ subscribed: false, devices: 0 });
    });

    it('una dirección ajena responde igual que una propia: no revela que existe', async () => {
      prisma.pushSubscription.updateMany.mockResolvedValue({ count: 0 });
      prisma.pushSubscription.count.mockResolvedValue(0);

      await expect(service.unsubscribe('u2', dto.endpoint)).resolves.toEqual({
        subscribed: false,
        devices: 0,
      });
    });
  });

  it('el estado cuenta solo los dispositivos activos del usuario', async () => {
    prisma.pushSubscription.count.mockResolvedValue(2);

    await expect(service.getStatus('u1')).resolves.toEqual({
      enabled: true,
      devices: 2,
    });
    expect(prisma.pushSubscription.count).toHaveBeenCalledWith({
      where: { userId: 'u1', isActive: true },
    });
  });

  it('sin claves VAPID el estado y la clave lo dicen, sin fallar', async () => {
    vapid.isEnabled.mockReturnValue(false);
    vapid.getPublicKey.mockReturnValue(null);

    expect(service.getPublicKey()).toEqual({
      enabled: false,
      publicKey: null,
    });
    await expect(service.getStatus('u1')).resolves.toMatchObject({
      enabled: false,
    });
  });
});

describe('SubscribePushDto (HU-37)', () => {
  const errorsOf = async (body: unknown) => {
    const errors = await validate(plainToInstance(SubscribePushDto, body));
    return errors.map((e) => e.property);
  };

  it('acepta el resultado de subscription.toJSON()', async () => {
    expect(await errorsOf({ ...dto, expirationTime: null })).toEqual([]);
  });

  it.each([
    ['sin claves', { endpoint: dto.endpoint }],
    ['p256dh corta', { ...dto, keys: { ...dto.keys, p256dh: 'abc' } }],
    [
      'auth con caracteres no válidos',
      { ...dto, keys: { ...dto.keys, auth: '+'.repeat(22) } },
    ],
    ['endpoint muy largo', { ...dto, endpoint: 'x'.repeat(2049) }],
  ])('rechaza %s', async (_name, body) => {
    expect((await errorsOf(body)).length).toBeGreaterThan(0);
  });
});
