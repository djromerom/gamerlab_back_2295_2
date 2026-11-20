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
 * BG-71 (ARK-285): solo califica quien registró su llegada en la mesa (check-in de HU-11).
 * Por HTTP con la aplicación completa (guards, permisos del seed y ValidationPipe):
 * - sin check-in: envío individual, lote y borrador responden 409 JUROR_NOT_CHECKED_IN y no
 *   guardan nada; la lista de borradores no bloquea;
 * - el administrador registra la llegada por búsqueda manual y entonces responde 201;
 * - si la llegada se anula, vuelve a responder 409.
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

const MESSAGE = 'Registra tu llegada en la mesa de ARKAD para poder calificar.';

describeIfDb(
  'Check-in obligatorio para calificar (ARK-285, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const id = (name: string) => `it-ark285-${runId}-${name}`;
    const [adminId, jurorId] = ['admin', 'jurado'].map(id);
    const allUsers = [adminId, jurorId];
    const CODES = ['C2850A', 'C2850B', 'C2850C', 'C2850D'];

    let app: INestApplication;
    let editionId: number;
    let originalEvaluationsOpen: boolean;
    let criteria: number[] = [];
    const teamIds: number[] = [];
    const gameIds: number[] = [];

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const server = () => request(app.getHttpServer() as never);
    const details = () =>
      criteria.map((criterionId) => ({ criterionId, score: 4 }));
    const single = (index: number) =>
      server().post('/evaluation/with-details').set(as(jurorId)).send({
        videogameId: gameIds[index],
        comments: 'ARK-285',
        details: details(),
      });
    const batch = (...indexes: number[]) =>
      server()
        .post('/evaluation/batch')
        .set(as(jurorId))
        .send({
          evaluations: indexes.map((index) => ({
            videogameId: gameIds[index],
            comments: 'ARK-285',
            details: details(),
          })),
        });
    const draft = (index: number, version = 0) =>
      server()
        .put(`/evaluation/drafts/${gameIds[index]}`)
        .set(as(jurorId))
        .send({
          version,
          comments: 'borrador',
          details: details().slice(0, 1),
        });
    const saved = () =>
      prisma.evaluation.count({ where: { videogameId: { in: gameIds } } });
    const checkInManually = () =>
      server().post('/juror-checkin/manual').set(as(adminId)).send({ jurorId });
    const activeAttendance = () =>
      prisma.jurorAttendance.findFirst({
        where: { jurorId, editionId, isActive: true },
      });

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

      for (const [userId, roleName, category] of [
        [adminId, 'Administrador', null],
        [jurorId, 'Jurado', JurorCategory.JUNIOR],
      ] as const) {
        const role = await prisma.role.findUniqueOrThrow({
          where: { name: roleName },
        });
        await prisma.user.create({
          data: {
            id: userId,
            email: `${userId}@uninorte.edu.co`,
            roleId: role.id,
            firstName: 'IT',
            lastName: 'ARK285',
            jurorCategory: category,
          },
        });
      }
      // El jurado es de la edición (HU-25), pero NO tiene llegada registrada.
      await prisma.jurorEdition.create({
        data: { jurorId, editionId, status: JurorEditionStatus.CONFIRMED },
      });
      const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
        where: { status: 'CONFIRMADO' },
      });
      const studentRole = await prisma.role.findUniqueOrThrow({
        where: { name: 'Estudiante' },
      });
      for (const [index, code] of CODES.entries()) {
        // Un líder por equipo: (usuario, edición) es único en `equipo`.
        const leader = id(`lider-${index}`);
        await prisma.user.create({
          data: {
            id: leader,
            email: `${leader}@uninorte.edu.co`,
            roleId: studentRole.id,
            firstName: 'IT',
            lastName: 'ARK285',
          },
        });
        allUsers.push(leader);
        const team = await prisma.team.create({
          data: {
            teamName: `it-ark285-${runId}-${index}`,
            userId: leader,
            editionId,
            teamCode: `N1-K${index}-${runId.slice(-4)}`,
            verificationCode: code,
            videogame: {
              create: {
                name: `it-ark285-${index}-${runId}`.slice(0, 30),
                videogameStatusId: confirmed.id,
              },
            },
            assignedJurors: { connect: { id: jurorId } },
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

      // HU-19: el jurado digita el código de cada grupo (no depende del check-in).
      for (const [index, teamId] of teamIds.entries()) {
        await server()
          .post('/team-verification/verify')
          .set(as(jurorId))
          .send({ teamId, code: CODES[index] })
          .expect(201);
      }
    });

    afterAll(async () => {
      await app?.close();
      await prisma.eventConfiguration.updateMany({
        where: { editionId },
        data: { evaluationsOpen: originalEvaluationsOpen },
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
      await prisma.evaluationDraft.deleteMany({
        where: { videogameId: { in: gameIds } },
      });
      await prisma.evaluationIdempotency.deleteMany({
        where: { jurorId },
      });
      await prisma.teamVerificationLog.deleteMany({
        where: { teamId: { in: teamIds } },
      });
      await prisma.teamVerification.deleteMany({
        where: { teamId: { in: teamIds } },
      });
      await prisma.jurorAttendance.deleteMany({ where: { jurorId } });
      await prisma.jurorEdition.deleteMany({ where: { jurorId } });
      await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: allUsers } },
      });
      await prisma.user.deleteMany({ where: { id: { in: allUsers } } });
      await prisma.$disconnect();
    });

    describe('sin check-in', () => {
      it('envío individual: 409 JUROR_NOT_CHECKED_IN y no guarda nada', async () => {
        const res = await single(0).expect(409);
        expect(res.body).toEqual({
          statusCode: 409,
          code: 'JUROR_NOT_CHECKED_IN',
          message: MESSAGE,
        });
        expect(await saved()).toBe(0);
      });

      it('envío en lote: 409 de toda la petición y no guarda ninguna fila', async () => {
        const res = await batch(1, 2).expect(409);
        expect(res.body).toMatchObject({
          statusCode: 409,
          code: 'JUROR_NOT_CHECKED_IN',
          message: MESSAGE,
        });
        expect(await saved()).toBe(0);
      });

      it('guardar un borrador: 409 JUROR_NOT_CHECKED_IN y no crea el borrador', async () => {
        const res = await draft(2).expect(409);
        expect(res.body).toMatchObject({ code: 'JUROR_NOT_CHECKED_IN' });
        expect(
          await prisma.evaluationDraft.count({
            where: { videogameId: { in: gameIds } },
          }),
        ).toBe(0);
      });

      it('la lista de borradores no bloquea: uno que ya existía sigue PENDING (no ofrece descartarlo)', async () => {
        await prisma.evaluationDraft.create({
          data: {
            jurorId,
            videogameId: gameIds[2],
            editionId,
            scores: [{ criterionId: criteria[0], score: 4 }],
            comments: 'ya escrito',
            version: 1,
          },
        });
        const res = await server()
          .get('/evaluation/drafts')
          .set(as(jurorId))
          .expect(200);
        const rows = res.body as {
          videogameId: number;
          status: string;
          blockedReason?: string;
        }[];
        const mine = rows.find((row) => row.videogameId === gameIds[2]);
        expect(mine).toMatchObject({ status: 'PENDING' });
        expect(mine?.blockedReason).toBeUndefined();
      });

      it('un grupo que no es suyo sigue dando 403 por asignación (no 409)', async () => {
        await server()
          .post('/evaluation/with-details')
          .set(as(jurorId))
          .send({
            videogameId: 2_000_000_000,
            comments: 'x',
            details: details(),
          })
          .expect(403);
      });
    });

    describe('con check-in', () => {
      it('el administrador lo registra por búsqueda manual y el jurado queda con llegada activa', async () => {
        await checkInManually().expect(201);
        expect(await activeAttendance()).not.toBeNull();
      });

      it('envío individual: 201 y se guarda', async () => {
        const res = await single(0).expect(201);
        expect(res.body).toMatchObject({ evaluationId: expect.any(Number) });
        expect(await saved()).toBe(1);
      });

      it('envío en lote: 201 y se guardan las filas', async () => {
        const res = await batch(1).expect(201);
        const body = res.body as {
          results: { successful: unknown[]; failed: unknown[] };
        };
        expect(body.results.successful).toHaveLength(1);
        expect(body.results.failed).toHaveLength(0);
        expect(await saved()).toBe(2);
      });

      it('guardar un borrador: se acepta', async () => {
        await draft(3).expect(200);
        expect(
          await prisma.evaluationDraft.count({
            where: { videogameId: gameIds[3], jurorId, isActive: true },
          }),
        ).toBe(1);
      });
    });

    describe('si la llegada se anula', () => {
      it('vuelve a responder 409 (la llegada anulada no cuenta)', async () => {
        const attendance = await activeAttendance();
        await server()
          .patch(`/juror-attendance/${attendance!.id}/annul`)
          .set(as(adminId))
          .send({ reason: 'ARK-285 prueba' })
          .expect(200);

        const res = await single(2).expect(409);
        expect(res.body).toMatchObject({ code: 'JUROR_NOT_CHECKED_IN' });
        expect(await saved()).toBe(2);
      });

      it('al registrar la llegada otra vez puede calificar de nuevo', async () => {
        await checkInManually().expect(201);
        await single(2).expect(201);
        expect(await saved()).toBe(3);
      });
    });
  },
);
