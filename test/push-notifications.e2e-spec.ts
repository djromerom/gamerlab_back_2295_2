import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  CheckInMethod,
  EditionStatus,
  JurorCategory,
  JurorEditionStatus,
  PrismaClient,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as webpush from 'web-push';
import { AppModule } from '../src/app.module';
import { AzureStorageService } from '../src/upload/azure-storage.service';

// Ningún aviso sale a un servicio de push real: solo se simula el envío.
jest.mock('web-push', () => ({
  ...jest.requireActual<typeof webpush>('web-push'),
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
}));

/**
 * HU-37: permisos de todas las rutas `/push/*` por HTTP contra PostgreSQL real, con la aplicación
 * completa (guards y permisos del seed) y cuentas de Administrador, Profesor, Jurado y Estudiante.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed
 * (edición activa, evaluaciones abiertas y roles). Crea sus propios usuarios y equipo, y los borra.
 * Las claves VAPID se generan en memoria para esta corrida.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

// Sin .env (CI): valores de prueba para las variables que se exigen al construir los servicios.
process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

describeIfDb('Rutas de notificaciones push por rol (HTTP + PostgreSQL)', () => {
  let prisma: PrismaClient;
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const runId = Date.now().toString(36);
  const userId = (name: string) => `it-hu37-${runId}-${name}`;
  const admin = userId('admin');
  const professor = userId('profesor');
  const juror = userId('jurado');
  const arrived = userId('llego');
  const student = userId('estudiante');
  const allUsers = [admin, professor, juror, arrived, student];
  const send = webpush.sendNotification as jest.Mock;

  let app: INestApplication;
  let teamId: number;
  let editionId: number;

  const as = (sub: string) => ({
    Cookie: `access-token=${jwt.sign(
      { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
      { expiresIn: 900 },
    )}`,
  });
  const server = () => request(app.getHttpServer() as never);
  const body = (name: string) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${runId}-${name}`,
    expirationTime: null,
    keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
  });
  const notice = { title: 'Prueba', body: 'Aviso de prueba' };

  const createUser = async (id: string, roleName: string) => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    await prisma.user.create({
      data: {
        id,
        email: `${id}@uninorte.edu.co`,
        roleId: role.id,
        firstName: 'IT',
        lastName: 'HU37',
        jurorCategory: roleName === 'Jurado' ? JurorCategory.JUNIOR : null,
      },
    });
  };

  /** Quién recibió el último envío, según los dispositivos que se le entregaron a web-push. */
  const endpointsSent = () =>
    (send.mock.calls as [{ endpoint: string }][]).map(
      ([device]) => device.endpoint,
    );

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    process.env.DATABASE_URL = url;
    const keys = jest
      .requireActual<typeof webpush>('web-push')
      .generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:pruebas@example.com';

    const edition = await prisma.edition.findFirstOrThrow({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
    });
    editionId = edition.id;
    await createUser(admin, 'Administrador');
    await createUser(professor, 'Profesor');
    await createUser(juror, 'Jurado');
    await createUser(arrived, 'Jurado');
    await createUser(student, 'Estudiante');
    await prisma.jurorEdition.createMany({
      data: [professor, juror, arrived].map((jurorId) => ({
        jurorId,
        editionId,
        status: JurorEditionStatus.CONFIRMED,
      })),
    });
    await prisma.jurorAttendance.create({
      data: {
        jurorId: arrived,
        editionId,
        checkedInById: admin,
        method: CheckInMethod.MANUAL,
      },
    });
    const team = await prisma.team.create({
      data: {
        teamName: `it-hu37-${runId}`,
        userId: student,
        editionId,
        teamCode: `N1-P-${runId.slice(-5)}`,
        videogame: { create: { name: `it-hu37-${runId}`.slice(0, 30) } },
        assignedJurors: { connect: { id: juror } },
      },
    });
    teamId = team.id;

    // Azure exige credenciales y crea el contenedor al iniciar; esta prueba no lo usa
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AzureStorageService)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    await prisma.jurorAttendance.deleteMany({
      where: { jurorId: { in: allUsers } },
    });
    await prisma.jurorEdition.deleteMany({
      where: { jurorId: { in: allUsers } },
    });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: allUsers } },
    });
    // La llave foránea borra también las suscripciones.
    await prisma.user.deleteMany({ where: { id: { in: allUsers } } });
    await prisma.$disconnect();
  });

  beforeEach(() => send.mockClear());

  describe.each([
    ['Administrador', admin],
    ['Profesor', professor],
    ['Jurado', juror],
  ])('rutas propias: %s puede', (name, sub) => {
    it('leer la clave pública y el estado', async () => {
      const key = await server()
        .get('/push/public-key')
        .set(as(sub))
        .expect(200);
      expect(key.body).toEqual({
        enabled: true,
        publicKey: process.env.VAPID_PUBLIC_KEY,
      });

      const status = await server()
        .get('/push/status')
        .set(as(sub))
        .expect(200);
      expect(status.body).toEqual({ enabled: true, devices: 0 });
    });

    it('suscribir y desuscribir su dispositivo', async () => {
      const subscribed = await server()
        .post('/push/subscribe')
        .set(as(sub))
        .send(body(`temporal-${name}`))
        .expect(201);
      expect(subscribed.body).toEqual({ subscribed: true, devices: 1 });

      const removed = await server()
        .post('/push/unsubscribe')
        .set(as(sub))
        .send({ endpoint: body(`temporal-${name}`).endpoint })
        .expect(200);
      expect(removed.body).toEqual({ subscribed: false, devices: 0 });
    });
  });

  describe('Estudiante recibe 403 en todas', () => {
    it.each<[string, 'get' | 'post', string]>([
      ['GET /push/public-key', 'get', '/push/public-key'],
      ['GET /push/status', 'get', '/push/status'],
      ['POST /push/subscribe', 'post', '/push/subscribe'],
      ['POST /push/unsubscribe', 'post', '/push/unsubscribe'],
      ['POST /push/notices', 'post', '/push/notices'],
      ['POST arrival-reminder', 'post', '/push/notices/arrival-reminder'],
      ['POST pending-evaluations', 'post', '/push/notices/pending-evaluations'],
    ])('%s', async (_name, method, path) => {
      await server()[method](path).set(as(student)).expect(403);
    });
  });

  describe('avisos del administrador', () => {
    const noticeRoutes = [
      '/push/notices',
      '/push/notices/arrival-reminder',
      '/push/notices/pending-evaluations',
    ];

    it.each(noticeRoutes)('%s: Jurado y Profesor reciben 403', async (path) => {
      await server().post(path).set(as(juror)).send(notice).expect(403);
      await server().post(path).set(as(professor)).send(notice).expect(403);
      expect(send).not.toHaveBeenCalled();
    });

    it.each(noticeRoutes)('%s: sin sesión responde 401', async (path) => {
      await server().post(path).send(notice).expect(401);
    });

    it('prepara un dispositivo por jurado', async () => {
      for (const [sub, name] of [
        [professor, 'profesor'],
        [juror, 'jurado'],
        [arrived, 'llego'],
      ]) {
        await server()
          .post('/push/subscribe')
          .set(as(sub))
          .send(body(name))
          .expect(201);
      }
    });

    const rowOf = (res: request.Response, jurorId: string) =>
      (
        res.body as { results: { jurorId: string; sent: number }[] }
      ).results.find((row) => row.jurorId === jurorId);

    it('POST /push/notices: responde 200 por jurado', async () => {
      const res = await server()
        .post('/push/notices')
        .set(as(admin))
        .send(notice)
        .expect(200);

      expect(rowOf(res, juror)).toMatchObject({ devices: 1, sent: 1 });
      expect(rowOf(res, professor)).toMatchObject({ devices: 1, sent: 1 });
      expect(endpointsSent()).toEqual(
        expect.arrayContaining([body('jurado').endpoint]),
      );
    });

    it('POST /push/notices: 400 si lleva datos sensibles', async () => {
      const res = await server()
        .post('/push/notices')
        .set(as(admin))
        .send({ title: 'Aviso', body: 'Escribe a alguien@uninorte.edu.co' })
        .expect(400);

      expect((res.body as { code: string }).code).toBe(
        'PUSH_NOTICE_SENSITIVE_DATA',
      );
      expect(send).not.toHaveBeenCalled();
    });

    it('recordatorio de llegada: 200 y no incluye a quien ya llegó', async () => {
      const res = await server()
        .post('/push/notices/arrival-reminder')
        .set(as(admin))
        .expect(200);

      expect(rowOf(res, juror)).toMatchObject({ sent: 1 });
      expect(rowOf(res, arrived)).toBeUndefined();
      expect(endpointsSent()).not.toContain(body('llego').endpoint);
    });

    it('pendientes: 200 y solo a quien tiene equipos sin calificar', async () => {
      const res = await server()
        .post('/push/notices/pending-evaluations')
        .set(as(admin))
        .expect(200);

      expect(rowOf(res, juror)).toMatchObject({ sent: 1 });
      expect(rowOf(res, professor)).toBeUndefined();
      expect(endpointsSent()).toEqual([body('jurado').endpoint]);
    });

    it('reasignar por la API avisa al que sale y al que entra', async () => {
      await server()
        .patch('/juror/assignments/reassign')
        .set(as(admin))
        .send({
          teamId,
          currentJurorId: juror,
          newJurorId: arrived,
          confirmWarnings: true,
        })
        .expect(200);

      // El aviso sale en segundo plano: la respuesta no lo espera.
      for (let i = 0; i < 50 && send.mock.calls.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(endpointsSent().sort()).toEqual(
        [body('jurado').endpoint, body('llego').endpoint].sort(),
      );
      await prisma.jurorAssignmentAuditLog.deleteMany({
        where: { actorUserId: admin },
      });
    });

    it('un jurado no puede desuscribir el dispositivo de otro', async () => {
      await server()
        .post('/push/unsubscribe')
        .set(as(professor))
        .send({ endpoint: body('jurado').endpoint })
        .expect(200);

      const status = await server()
        .get('/push/status')
        .set(as(juror))
        .expect(200);
      expect(status.body).toEqual({ enabled: true, devices: 1 });
    });
  });
});
