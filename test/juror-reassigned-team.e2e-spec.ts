import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  EditionStatus,
  JurorCategory,
  JurorEditionStatus,
  PrismaClient,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * ARK-190 (BG-41): el caso del profesor Daniel contra PostgreSQL real, con la aplicación completa
 * (guards, permisos del seed y HTTP): el administrador reasigna un equipo por la API y el jurado
 * que lo perdió y el que lo recibió intentan calificarlo.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con las migraciones y el
 * seed aplicados (edición activa, evaluaciones abiertas, criterios y roles). Crea sus propios
 * usuarios y equipo, y los borra al final.
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

describeIfDb('Equipo reasignado (HTTP + PostgreSQL)', () => {
  const prisma = new PrismaClient({
    // Sin URL la suite se salta, pero describe.skip igual ejecuta este cuerpo.
    datasources: { db: { url: url ?? 'postgresql://unused' } },
  });
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const runId = Date.now().toString(36);
  const CODE = 'R3A5GN';
  const userId = (name: string) => `it-ark190-${runId}-${name}`;
  const [adminId, jurorA, jurorB, ownerId] = ['admin', 'a', 'b', 'owner'].map(
    userId,
  );
  const allUsers = [adminId, jurorA, jurorB, ownerId];

  let app: INestApplication;
  let teamId: number;
  let videogameId: number;
  let evaluation: {
    videogameId: number;
    comments: string;
    details: Record<string, unknown>[];
  };

  const as = (sub: string) => ({
    Cookie: `access-token=${jwt.sign(
      { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
      { expiresIn: 900 },
    )}`,
  });
  const server = () => request(app.getHttpServer() as never);
  const submit = (sub: string, key: string) =>
    server()
      .post('/evaluation/with-details')
      .set(as(sub))
      .set('Idempotency-Key', key)
      .send(evaluation);
  const reassign = (currentJurorId: string, newJurorId: string) =>
    server()
      .patch('/juror/assignments/reassign')
      .set(as(adminId))
      .send({ teamId, currentJurorId, newJurorId, confirmWarnings: true });
  const pendingIds = async (sub: string) => {
    const res = await server()
      .get('/pending-games?limit=100&page=1')
      .set(as(sub))
      .expect(200);
    return (res.body as { data: { videogameId: number }[] }).data.map(
      (game) => game.videogameId,
    );
  };

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
        lastName: 'ARK190',
        jurorCategory: roleName === 'Jurado' ? JurorCategory.JUNIOR : null,
      },
    });
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const edition = await prisma.edition.findFirstOrThrow({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
    });
    await createUser(adminId, 'Administrador');
    await createUser(jurorA, 'Jurado');
    await createUser(jurorB, 'Jurado');
    await createUser(ownerId, 'Estudiante');
    await prisma.jurorEdition.createMany({
      data: [jurorA, jurorB].map((jurorId) => ({
        jurorId,
        editionId: edition.id,
        status: JurorEditionStatus.CONFIRMED,
      })),
    });
    // BG-71 (ARK-285): solo califica quien hizo check-in; cada jurado ya llegó a la mesa.
    await prisma.jurorAttendance.createMany({
      data: [jurorA, jurorB].map((jurorId) => ({
        jurorId,
        editionId: edition.id,
        checkedInById: adminId,
        method: 'MANUAL' as const,
      })),
    });
    const team = await prisma.team.create({
      data: {
        teamName: `it-ark190-${runId}`,
        userId: ownerId,
        editionId: edition.id,
        teamCode: `N1-R-${runId.slice(-5)}`,
        verificationCode: CODE,
        videogame: { create: { name: `it-ark190-${runId}`.slice(0, 30), videogameStatusId: 1 } },
        assignedJurors: { connect: { id: jurorA } },
      },
      include: { videogame: true },
    });
    teamId = team.id;
    videogameId = team.videogame!.id;
    await prisma.teamVerification.create({
      data: { teamId, jurorId: jurorA },
    });

    const criteria = await prisma.criterion.findMany({
      where: { isActive: true },
    });
    const now = '2026-11-26T10:00:00.000Z';
    evaluation = {
      videogameId,
      comments: 'Lo que el jurado escribió',
      details: criteria.map((criterion) => ({
        criterionId: criterion.id,
        score: 4,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })),
    };

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
    const evaluations = await prisma.evaluation.findMany({
      where: { videogameId },
      select: { id: true },
    });
    await prisma.evaluationDetail.deleteMany({
      where: { evaluationId: { in: evaluations.map((e) => e.id) } },
    });
    await prisma.evaluation.deleteMany({ where: { videogameId } });
    await prisma.evaluationIdempotency.deleteMany({
      where: { jurorId: { in: allUsers } },
    });
    await prisma.teamVerificationLog.deleteMany({ where: { teamId } });
    await prisma.teamVerification.deleteMany({ where: { teamId } });
    await prisma.jurorAssignmentAuditLog.deleteMany({
      where: { actorUserId: adminId },
    });
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
    await prisma.user.deleteMany({ where: { id: { in: allUsers } } });
    await prisma.$disconnect();
  });

  // Los pasos dependen del anterior: es un solo recorrido de la reasignación.
  it('el jurado asignado ve el equipo en pendientes', async () => {
    expect(await pendingIds(jurorA)).toContain(videogameId);
  });

  it('el administrador reasigna el equipo sin error', async () => {
    await reassign(jurorA, jurorB).expect(200);
  });

  it('quien lo perdió: 403 al calificar, sin tocar cookies ni guardar nada', async () => {
    const res = await submit(jurorA, 'llave-a');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Este grupo no está asignado al evaluador',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await prisma.evaluation.count({ where: { videogameId } })).toBe(0);
  });

  it('quien lo perdió: el lote lo informa por fila, también sin tocar cookies', async () => {
    const res = await server()
      .post('/evaluation/batch')
      .set(as(jurorA))
      .send({ evaluations: [evaluation] });

    expect(res.status).toBe(201);
    expect((res.body as { results: unknown }).results).toEqual({
      successful: [],
      failed: [
        { videogameId, error: 'Este grupo no está asignado al evaluador' },
      ],
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('quien lo perdió sigue con sesión y ya no lo ve en pendientes', async () => {
    expect(await pendingIds(jurorA)).not.toContain(videogameId);
  });

  it('quien lo recibió lo ve, digita el código y lo califica', async () => {
    expect(await pendingIds(jurorB)).toContain(videogameId);

    const unverified = await submit(jurorB, 'llave-b');
    expect(unverified.status).toBe(403);

    await server()
      .post('/team-verification/verify')
      .set(as(jurorB))
      .send({ teamId, code: CODE })
      .expect(201);

    await submit(jurorB, 'llave-b').expect(201);
    expect(await pendingIds(jurorB)).not.toContain(videogameId);
  });

  it('si se lo devuelven, quien lo perdió califica con la misma llave', async () => {
    await reassign(jurorB, jurorA).expect(200);

    await submit(jurorA, 'llave-a').expect(201);
    expect(await prisma.evaluation.count({ where: { videogameId } })).toBe(2);
  });

  it('una cookie vencida sí es 401', async () => {
    const expired = jwt.sign(
      { sub: jurorA, email: `${jurorA}@uninorte.edu.co`, type: 'access' },
      { expiresIn: -10 },
    );
    await server()
      .get('/pending-games?limit=100&page=1')
      .set('Cookie', `access-token=${expired}`)
      .expect(401);
  });
});
