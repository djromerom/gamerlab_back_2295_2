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
 * HU-18 (ARK-104): borradores de evaluación por HTTP contra PostgreSQL real, con la aplicación
 * completa (guards, permisos del seed y ValidationPipe). Recorre el CU-18: guardar, salir y
 * volver, sesión vencida, autoguardado atrasado, evaluaciones cerradas, envío (individual y por
 * lote) y el flujo A1 (asignación cambiada).
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed
 * (edición activa, evaluaciones abiertas, criterios y roles). Crea sus datos y los borra al final.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

type Draft = {
  videogameId: number;
  version: number;
  status: string;
  blockedReason?: string;
  comments: string | null;
  details: { criterionId: number; score: number }[];
};

describeIfDb('Borradores de evaluación (HU-18, HTTP + PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: url ?? 'postgresql://unused' } },
  });
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const runId = Date.now().toString(36);
  const CODES = ['D1R4FT', 'D2R4FT'];
  const userId = (name: string) => `it-ark104-${runId}-${name}`;
  const [adminId, jurorA, jurorB, ownerA, ownerB] = [
    'admin',
    'a',
    'b',
    'owner-a',
    'owner-b',
  ].map(userId);
  const allUsers = [adminId, jurorA, jurorB, ownerA, ownerB];

  let app: INestApplication;
  let editionId: number;
  let originalEvaluationsOpen: boolean;
  const teamIds: number[] = [];
  const gameIds: number[] = [];
  let criteria: number[] = [];

  const as = (sub: string, expiresIn = 900) => ({
    Cookie: `access-token=${jwt.sign(
      { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
      { expiresIn },
    )}`,
  });
  const server = () => request(app.getHttpServer() as never);
  const put = (sub: string, videogameId: number, body: object) =>
    server().put(`/evaluation/drafts/${videogameId}`).set(as(sub)).send(body);
  const fullEvaluation = (videogameId: number) => ({
    videogameId,
    comments: 'Versión final',
    details: criteria.map((criterionId) => ({
      criterionId,
      score: 4,
      isActive: true,
      createdAt: '2026-11-26T10:00:00.000Z',
      updatedAt: '2026-11-26T10:00:00.000Z',
    })),
  });
  const verify = (sub: string, index: number) =>
    server()
      .post('/team-verification/verify')
      .set(as(sub))
      .send({ teamId: teamIds[index], code: CODES[index] })
      .expect(201);
  const setEvaluationsOpen = (evaluationsOpen: boolean) =>
    prisma.eventConfiguration.updateMany({
      where: { editionId },
      data: { evaluationsOpen },
    });
  const draftRow = (jurorId: string, videogameId: number) =>
    prisma.evaluationDraft.findUnique({
      where: { borrador_jurado_videojuego_unique: { jurorId, videogameId } },
    });

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
        lastName: 'ARK104',
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
    editionId = edition.id;
    const config = await prisma.eventConfiguration.findFirstOrThrow({
      where: { editionId },
    });
    originalEvaluationsOpen = config.evaluationsOpen;
    await setEvaluationsOpen(true);

    await createUser(adminId, 'Administrador');
    await createUser(jurorA, 'Jurado');
    await createUser(jurorB, 'Jurado');
    await createUser(ownerA, 'Estudiante');
    await createUser(ownerB, 'Estudiante');
    await prisma.jurorEdition.createMany({
      data: [jurorA, jurorB].map((jurorId) => ({
        jurorId,
        editionId,
        status: JurorEditionStatus.CONFIRMED,
      })),
    });
    for (const [index, owner] of [ownerA, ownerB].entries()) {
      const team = await prisma.team.create({
        data: {
          teamName: `it-ark104-${runId}-${index}`,
          userId: owner,
          editionId,
          teamCode: `N1-D${index}-${runId.slice(-4)}`,
          verificationCode: CODES[index],
          videogame: {
            create: { name: `it-ark104-${index}-${runId}`.slice(0, 30), videogameStatusId: 1 },
          },
          assignedJurors: { connect: { id: jurorA } },
        },
        include: { videogame: true },
      });
      teamIds.push(team.id);
      gameIds.push(team.videogame!.id);
    }
    criteria = (
      await prisma.criterion.findMany({
        where: { isActive: true },
        select: { id: true },
      })
    ).map((c) => c.id);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
    await setEvaluationsOpen(originalEvaluationsOpen);
    await prisma.evaluationDraft.deleteMany({
      where: { videogameId: { in: gameIds } },
    });
    const evaluations = await prisma.evaluation.findMany({
      where: { videogameId: { in: gameIds } },
      select: { id: true },
    });
    await prisma.evaluationDetail.deleteMany({
      where: { evaluationId: { in: evaluations.map((e) => e.id) } },
    });
    await prisma.evaluation.deleteMany({
      where: { videogameId: { in: gameIds } },
    });
    await prisma.evaluationIdempotency.deleteMany({
      where: { jurorId: { in: allUsers } },
    });
    await prisma.teamVerificationLog.deleteMany({
      where: { teamId: { in: teamIds } },
    });
    await prisma.teamVerification.deleteMany({
      where: { teamId: { in: teamIds } },
    });
    await prisma.jurorAssignmentAuditLog.deleteMany({
      where: { actorUserId: adminId },
    });
    await prisma.jurorEdition.deleteMany({
      where: { jurorId: { in: allUsers } },
    });
    await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: allUsers } },
    });
    await prisma.user.deleteMany({ where: { id: { in: allUsers } } });
    await prisma.$disconnect();
  });

  // Un solo recorrido: cada paso depende del anterior.
  let progressBefore: { completed: number; assigned: number };

  it('guarda un borrador incompleto sin haber digitado el código del grupo', async () => {
    progressBefore = (await server().get('/evaluation/progress').expect(200))
      .body;

    const res = await put(jurorA, gameIds[0], {
      version: 0,
      details: [{ criterionId: criteria[0], score: 3.5 }],
      comments: 'Primera impresión',
    }).expect(200);

    expect(res.body).toMatchObject({
      videogameId: gameIds[0],
      teamId: teamIds[0],
      version: 1,
      status: 'PENDING',
      comments: 'Primera impresión',
      details: [{ criterionId: criteria[0], score: 3.5 }],
    });
  });

  it('el borrador no cuenta como evaluación recibida', async () => {
    expect(
      await prisma.evaluation.count({
        where: { videogameId: { in: gameIds } },
      }),
    ).toBe(0);
    const progress = (await server().get('/evaluation/progress').expect(200))
      .body;
    expect(progress.completed).toBe(progressBefore.completed);
  });

  it('la lista de pendientes lo marca y lo sigue mostrando como pendiente', async () => {
    const res = await server()
      .get('/pending-games?limit=100&page=1')
      .set(as(jurorA))
      .expect(200);
    const games = res.body.data as { videogameId: number; hasDraft: boolean }[];
    const byId = new Map(games.map((g) => [g.videogameId, g.hasDraft]));
    expect(byId.get(gameIds[0])).toBe(true);
    expect(byId.get(gameIds[1])).toBe(false);
    const count = await server()
      .get('/pending-games/count')
      .set(as(jurorA))
      .expect(200);
    expect(count.body.count).toBe(2);
  });

  it('con la sesión vencida responde 401 y lo guardado sigue intacto', async () => {
    await server()
      .put(`/evaluation/drafts/${gameIds[0]}`)
      .set(as(jurorA, -10))
      .send({ version: 1, comments: 'no debe guardarse' })
      .expect(401);
    expect((await draftRow(jurorA, gameIds[0]))?.comments).toBe(
      'Primera impresión',
    );
  });

  it('al volver a entrar (sesión nueva) encuentra el borrador y continúa', async () => {
    const one = await server()
      .get(`/evaluation/drafts/${gameIds[0]}`)
      .set(as(jurorA))
      .expect(200);
    expect(one.body.draft).toMatchObject({
      version: 1,
      comments: 'Primera impresión',
    });

    const list = await server()
      .get('/evaluation/drafts')
      .set(as(jurorA))
      .expect(200);
    expect((list.body as Draft[]).map((d) => d.videogameId)).toEqual([
      gameIds[0],
    ]);

    await put(jurorA, gameIds[0], {
      version: 1,
      details: [
        { criterionId: criteria[0], score: 3.5 },
        { criterionId: criteria[1], score: 5 },
      ],
      comments: 'Primera impresión, sigue',
    }).expect(200);
  });

  it('un autoguardado atrasado no pisa lo nuevo: 409 con la versión actual', async () => {
    const stale = await put(jurorA, gameIds[0], {
      version: 1,
      comments: 'viejo',
    }).expect(409);
    expect(stale.body).toMatchObject({
      code: 'DRAFT_VERSION_CONFLICT',
      draft: { version: 2, comments: 'Primera impresión, sigue' },
    });
    const otherTab = await put(jurorA, gameIds[0], { version: 0 }).expect(409);
    expect(otherTab.body.code).toBe('DRAFT_VERSION_CONFLICT');
  });

  it('valida las notas: 400 por puntaje fuera de rango y por campos de más', async () => {
    const out = await put(jurorA, gameIds[0], {
      version: 2,
      details: [{ criterionId: criteria[0], score: 7 }],
    }).expect(400);
    expect(out.body.message).toMatch(/out of range/);
    await put(jurorA, gameIds[0], { details: [] }).expect(400); // falta version
  });

  it('con las evaluaciones cerradas se sigue guardando, aunque no se pueda enviar', async () => {
    await setEvaluationsOpen(false);
    try {
      await put(jurorA, gameIds[0], {
        version: 2,
        details: [
          { criterionId: criteria[0], score: 3.5 },
          { criterionId: criteria[1], score: 5 },
        ],
        comments: 'Con evaluaciones cerradas',
      }).expect(200);
      await server()
        .post('/evaluation/with-details')
        .set(as(jurorA))
        .send(fullEvaluation(gameIds[0]))
        .expect(403);
      await server().get('/evaluation/drafts').set(as(jurorA)).expect(200);
    } finally {
      await setEvaluationsOpen(true);
    }
  });

  it('otro jurado no lo ve ni puede guardar sobre un grupo que no tiene', async () => {
    const list = await server()
      .get('/evaluation/drafts')
      .set(as(jurorB))
      .expect(200);
    expect(list.body).toEqual([]);
    const one = await server()
      .get(`/evaluation/drafts/${gameIds[0]}`)
      .set(as(jurorB))
      .expect(200);
    expect(one.body).toEqual({ draft: null });
    const res = await put(jurorB, gameIds[0], { version: 0 }).expect(403);
    expect(res.body.message).toBe('Este grupo no está asignado al evaluador');
  });

  it('un estudiante no tiene acceso a los borradores', async () => {
    await server().get('/evaluation/drafts').set(as(ownerA)).expect(403);
    await put(ownerA, gameIds[0], { version: 0 }).expect(403);
  });

  it('al enviar la evaluación el borrador deja de estar pendiente', async () => {
    await verify(jurorA, 0);
    await server()
      .post('/evaluation/with-details')
      .set(as(jurorA))
      .set('Idempotency-Key', `ark104-${runId}-a`)
      .send(fullEvaluation(gameIds[0]))
      .expect(201);

    expect(await draftRow(jurorA, gameIds[0])).toMatchObject({
      isActive: false,
      version: 4,
    });
    const list = await server()
      .get('/evaluation/drafts')
      .set(as(jurorA))
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it('un autoguardado que llega después del envío no revive el borrador', async () => {
    const late = await put(jurorA, gameIds[0], {
      version: 3,
      comments: 'tarde',
    }).expect(409);
    expect(late.body.code).toBe('EVALUATION_ALREADY_SUBMITTED');
    expect((await draftRow(jurorA, gameIds[0]))?.isActive).toBe(false);
  });

  it('dos pestañas que crean el borrador a la vez: solo una gana, la otra recibe 409', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        put(jurorA, gameIds[1], { version: 0, comments: `pestaña ${n}` }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([
      200, 409, 409, 409, 409,
    ]);
    expect(
      await prisma.evaluationDraft.count({
        where: { videogameId: gameIds[1] },
      }),
    ).toBe(1);
  });

  it('A1: si le quitan el grupo, el borrador aparece como NOT_ASSIGNED y se puede descartar', async () => {
    await put(jurorA, gameIds[1], {
      version: 1,
      details: [{ criterionId: criteria[0], score: 2 }],
    }).expect(200);

    await server()
      .patch('/juror/assignments/reassign')
      .set(as(adminId))
      .send({
        teamId: teamIds[1],
        currentJurorId: jurorA,
        newJurorId: jurorB,
        confirmWarnings: true,
      })
      .expect(200);

    const list = await server()
      .get('/evaluation/drafts')
      .set(as(jurorA))
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        videogameId: gameIds[1],
        status: 'NOT_ASSIGNED',
        blockedReason: 'Este grupo no está asignado al evaluador',
      }),
    ]);

    const discarded = await server()
      .delete(`/evaluation/drafts/${gameIds[1]}`)
      .set(as(jurorA))
      .expect(200);
    expect(discarded.body).toEqual({ discarded: true });
    const again = await server()
      .delete(`/evaluation/drafts/${gameIds[1]}`)
      .set(as(jurorA))
      .expect(200);
    expect(again.body).toEqual({ discarded: false });
  });

  it('el envío por lote también cierra el borrador', async () => {
    await put(jurorB, gameIds[1], {
      version: 0,
      details: [{ criterionId: criteria[0], score: 4 }],
    }).expect(200);
    await verify(jurorB, 1);

    const res = await server()
      .post('/evaluation/batch')
      .set(as(jurorB))
      .send({ evaluations: [fullEvaluation(gameIds[1])] })
      .expect(201);
    expect(res.body.results.successful).toHaveLength(1);
    expect((await draftRow(jurorB, gameIds[1]))?.isActive).toBe(false);
  });
});
