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
 * ARK-250 (BG-47): una evaluación con un puntaje nulo o vacío se rechaza con 400 (envío
 * individual y por lote) y no deja nada guardado; un 0 escrito explícitamente sí se envía.
 * Va por HTTP con la aplicación completa (guards, permisos del seed y el ValidationPipe de main.ts).
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

describeIfDb(
  'Evaluaciones con puntajes nulos (ARK-250, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const jurorId = `it-ark250-${runId}-juror`;
    const ownerId = `it-ark250-${runId}-owner`;
    const CODE = 'N0LL50';

    let app: INestApplication;
    let editionId: number;
    let originalEvaluationsOpen: boolean;
    let teamId: number;
    let videogameId: number;
    let criteria: number[] = [];

    const cookie = () => ({
      Cookie: `access-token=${jwt.sign(
        { sub: jurorId, email: `${jurorId}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const server = () => request(app.getHttpServer() as never);
    const body = (score: (index: number) => unknown) => ({
      videogameId,
      comments: 'ARK-250',
      details: criteria.map((criterionId, index) => ({
        criterionId,
        score: score(index),
      })),
    });
    const single = (payload: object) =>
      server().post('/evaluation/with-details').set(cookie()).send(payload);
    const batch = (...evaluations: object[]) =>
      server().post('/evaluation/batch').set(cookie()).send({ evaluations });
    const saved = () => prisma.evaluation.count({ where: { videogameId } });

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
      await prisma.eventConfiguration.updateMany({
        where: { editionId },
        data: { evaluationsOpen: true },
      });

      const [juryRole, studentRole] = await Promise.all([
        prisma.role.findUniqueOrThrow({ where: { name: 'Jurado' } }),
        prisma.role.findUniqueOrThrow({ where: { name: 'Estudiante' } }),
      ]);
      await prisma.user.create({
        data: {
          id: jurorId,
          email: `${jurorId}@uninorte.edu.co`,
          roleId: juryRole.id,
          firstName: 'IT',
          lastName: 'ARK250',
          jurorCategory: JurorCategory.JUNIOR,
        },
      });
      await prisma.user.create({
        data: {
          id: ownerId,
          email: `${ownerId}@uninorte.edu.co`,
          roleId: studentRole.id,
          firstName: 'IT',
          lastName: 'ARK250',
        },
      });
      await prisma.jurorEdition.create({
        data: { jurorId, editionId, status: JurorEditionStatus.CONFIRMED },
      });
      // BG-71 (ARK-285): solo califica quien hizo check-in; cada jurado ya llegó a la mesa.
      await prisma.jurorAttendance.create({
        data: { jurorId, editionId, checkedInById: jurorId, method: 'MANUAL' },
      });
      const team = await prisma.team.create({
        data: {
          teamName: `it-ark250-${runId}`,
          userId: ownerId,
          editionId,
          teamCode: `N1-Z0-${runId.slice(-4)}`,
          verificationCode: CODE,
          videogame: {
            create: {
              name: `it-ark250-${runId}`.slice(0, 30),
              videogameStatusId: 1,
            },
          },
          assignedJurors: { connect: { id: jurorId } },
        },
        include: { videogame: true },
      });
      teamId = team.id;
      videogameId = team.videogame!.id;
      criteria = (
        await prisma.criterion.findMany({
          where: { isActive: true },
          select: { id: true },
          orderBy: { id: 'asc' },
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

      await server()
        .post('/team-verification/verify')
        .set(cookie())
        .send({ teamId, code: CODE })
        .expect(201);
    });

    afterAll(async () => {
      await app?.close();
      await prisma.eventConfiguration.updateMany({
        where: { editionId },
        data: { evaluationsOpen: originalEvaluationsOpen },
      });
      const evaluations = await prisma.evaluation.findMany({
        where: { videogameId },
        select: { id: true },
      });
      await prisma.evaluationDetail.deleteMany({
        where: { evaluationId: { in: evaluations.map((e) => e.id) } },
      });
      await prisma.evaluation.deleteMany({ where: { videogameId } });
      await prisma.evaluationDraft.deleteMany({ where: { videogameId } });
      await prisma.evaluationIdempotency.deleteMany({ where: { jurorId } });
      await prisma.teamVerificationLog.deleteMany({ where: { teamId } });
      await prisma.teamVerification.deleteMany({ where: { teamId } });
      await prisma.jurorAttendance.deleteMany({ where: { jurorId } });
      await prisma.jurorEdition.deleteMany({ where: { jurorId } });
      await prisma.team.deleteMany({ where: { id: teamId } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [jurorId, ownerId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [jurorId, ownerId] } },
      });
      await prisma.$disconnect();
    });

    it.each([
      ['null', null],
      ['cadena vacía', ''],
      ['texto', 'abc'],
      ['número como texto', '4'],
    ])(
      'envío individual: un criterio con puntaje %s da 400 y no guarda nada',
      async (_name, bad) => {
        const res = await single(body((i) => (i === 0 ? bad : 4))).expect(400);
        expect(JSON.stringify(res.body)).toContain('no puede ser nulo');
        expect(await saved()).toBe(0);
      },
    );

    it('envío individual: un criterio sin la propiedad score da 400', async () => {
      const payload = body(() => 4);
      delete (payload.details[0] as { score?: number }).score;
      await single(payload).expect(400);
      expect(await saved()).toBe(0);
    });

    it('lote: un puntaje nulo rechaza toda la petición con 400 y no guarda nada', async () => {
      await batch(body((i) => (i === 0 ? null : 4))).expect(400);
      await batch(body((i) => (i === 0 ? '' : 4))).expect(400);
      expect(await saved()).toBe(0);
    });

    it('un puntaje fuera de rango sigue dando 400', async () => {
      await single(body((i) => (i === 0 ? 6 : 4))).expect(400);
      expect(await saved()).toBe(0);
    });

    it('un 0 escrito explícitamente sí se envía y se guarda como 0', async () => {
      const res = await single(body((i) => (i === 0 ? 0 : 4))).expect(201);
      const { evaluationId } = res.body as { evaluationId: number };
      expect(evaluationId).toEqual(expect.any(Number));
      const details = await prisma.evaluationDetail.findMany({
        where: { evaluationId },
        orderBy: { criterionId: 'asc' },
      });
      expect(details).toHaveLength(criteria.length);
      expect(details[0].score).toBe(0);
      expect(details.slice(1).every((d) => d.score === 4)).toBe(true);
      expect(await saved()).toBe(1);
    });
  },
);
