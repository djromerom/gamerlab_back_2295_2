import { randomUUID } from 'crypto';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { PushSenderService } from './push-sender.service';
import { PushSubscriptionsService } from './push-subscriptions.service';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));

/**
 * Integración (HU-37): suscripciones y limpieza de vencidas contra Postgres real. El envío se
 * simula. Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('HU-37: suscripciones push (BD real)', () => {
  const prisma = new PrismaService();
  const vapid = { isEnabled: () => true, getPublicKey: () => 'k' };
  const subscriptions = new PushSubscriptionsService(prisma, vapid as any);
  const sender = new PushSenderService(prisma, vapid as any);
  const tag = randomUUID().slice(0, 8);
  const users: string[] = [];

  const dto = (suffix: string): SubscribePushDto => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${tag}-${suffix}`,
    keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
  });

  beforeAll(async () => {
    await prisma.$connect();
    const role = await prisma.role.findFirstOrThrow({
      where: { name: 'Jurado' },
    });
    for (const key of ['a', 'b']) {
      const user = await prisma.user.create({
        data: {
          email: `${key}-${tag}@hu37.test`,
          firstName: key,
          lastName: `HU37${tag}`,
          roleId: role.id,
        },
        select: { id: true },
      });
      users.push(user.id);
    }
  });

  afterAll(async () => {
    // Prueba también el borrado en cascada de la llave foránea.
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await expect(
      prisma.pushSubscription.count({ where: { userId: { in: users } } }),
    ).resolves.toBe(0);
    await prisma.$disconnect();
  });

  it('una fila por dispositivo: suscribirse dos veces no la duplica', async () => {
    await subscriptions.subscribe(users[0], dto('1'));
    const result = await subscriptions.subscribe(users[0], dto('1'));
    expect(result.devices).toBe(1);

    await expect(
      subscriptions.subscribe(users[0], dto('2')),
    ).resolves.toMatchObject({ devices: 2 });
  });

  it('otro usuario no puede desactivar un dispositivo ajeno', async () => {
    await subscriptions.unsubscribe(users[1], dto('1').endpoint);

    await expect(subscriptions.getStatus(users[0])).resolves.toMatchObject({
      devices: 2,
    });
  });

  it('desuscribirse desactiva la fila sin borrarla, y suscribirse la reactiva', async () => {
    const { endpoint } = dto('1');

    await subscriptions.unsubscribe(users[0], endpoint);
    await expect(
      prisma.pushSubscription.findUnique({ where: { endpoint } }),
    ).resolves.toMatchObject({ isActive: false });

    await subscriptions.subscribe(users[0], dto('1'));
    await expect(
      prisma.pushSubscription.findUnique({ where: { endpoint } }),
    ).resolves.toMatchObject({ isActive: true });
  });

  it('un dispositivo compartido pasa al último usuario que se suscribe', async () => {
    await subscriptions.subscribe(users[1], dto('1'));

    await expect(
      prisma.pushSubscription.findUnique({
        where: { endpoint: dto('1').endpoint },
      }),
    ).resolves.toMatchObject({ userId: users[1] });
    await expect(subscriptions.getStatus(users[0])).resolves.toMatchObject({
      devices: 1,
    });
  });

  it('el envío elimina de verdad las vencidas y conserva las demás', async () => {
    (webpush.sendNotification as jest.Mock).mockImplementation(
      (subscription: { endpoint: string }) =>
        subscription.endpoint === dto('2').endpoint
          ? Promise.reject(
              Object.assign(new Error('gone'), { statusCode: 410 }),
            )
          : Promise.resolve({ statusCode: 201 }),
    );

    const result = await sender.sendToUsers(users, {
      title: 'Aviso',
      body: 'Mensaje',
    });

    expect(result.totals).toEqual({
      devices: 2,
      sent: 1,
      expired: 1,
      failed: 0,
    });
    await expect(
      prisma.pushSubscription.findUnique({
        where: { endpoint: dto('2').endpoint },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.pushSubscription.findUnique({
        where: { endpoint: dto('1').endpoint },
      }),
    ).resolves.not.toBeNull();
  });
});
