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
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-17 (ARK-183): encuesta de experiencia del jurado por HTTP contra PostgreSQL real, con la
 * aplicación completa (guards, permisos del seed y ValidationPipe). Recorre el CU-17: no aparece
 * hasta que el jurado envía todas sus evaluaciones, se responde una vez y el administrador ve el
 * resumen y el Excel.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
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
  'Encuesta de experiencia del jurado (HU-17, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const CODES = ['S1RV3Y', 'S2RV3Y'];
    const userId = (name: string) => `it-ark183-${runId}-${name}`;
    const [adminId, jurorA, outsider, ownerA, ownerB] = [
      'admin',
      'a',
      'outsider',
      'owner-a',
      'owner-b',
    ].map(userId);
    const allUsers = [adminId, jurorA, outsider, ownerA, ownerB];

    let app: INestApplication;
    let editionId: number;
    const teamIds: number[] = [];
    const gameIds: number[] = [];
    let criteria: number[] = [];

    const answer = {
      loginEase: 5,
      groupsClarity: 4,
      gradingEase: 4,
      stability: 3,
      fairOrganization: 5,
      overall: 4,
      comments: `  Faltó señalizar el salón (${runId})  `,
    };

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const server = () => request(app.getHttpServer() as never);
    const status = async (sub: string) =>
      (await server().get('/juror-survey/status').set(as(sub)).expect(200))
        .body;
    const submitEvaluation = async (index: number) => {
      await server()
        .post('/team-verification/verify')
        .set(as(jurorA))
        .send({ teamId: teamIds[index], code: CODES[index] })
        .expect(201);
      await server()
        .post('/evaluation/with-details')
        .set(as(jurorA))
        .set('Idempotency-Key', `ark183-${runId}-${index}`)
        .send({
          videogameId: gameIds[index],
          comments: 'ok',
          details: criteria.map((criterionId) => ({
            criterionId,
            score: 4,
            isActive: true,
            createdAt: '2026-11-26T10:00:00.000Z',
            updatedAt: '2026-11-26T10:00:00.000Z',
          })),
        })
        .expect(201);
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
          lastName: `ARK183 ${id.split('-').pop()}`,
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
      // No se toca «evaluaciones abiertas»: las suites e2e corren en paralelo sobre la misma base
      // y cerrarlas aquí hace fallar a las que califican. El seed las deja abiertas.

      await createUser(adminId, 'Administrador');
      await createUser(jurorA, 'Jurado');
      await createUser(outsider, 'Jurado');
      await createUser(ownerA, 'Estudiante');
      await createUser(ownerB, 'Estudiante');
      // Solo jurorA es jurado confirmado de la edición; outsider tiene sesión pero no es de la edición.
      await prisma.jurorEdition.create({
        data: {
          jurorId: jurorA,
          editionId,
          status: JurorEditionStatus.CONFIRMED,
        },
      });
      for (const [index, owner] of [ownerA, ownerB].entries()) {
        const team = await prisma.team.create({
          data: {
            teamName: `it-ark183-${runId}-${index}`,
            userId: owner,
            editionId,
            teamCode: `N1-S${index}-${runId.slice(-4)}`,
            verificationCode: CODES[index],
            videogame: {
              create: { name: `it-ark183-${index}-${runId}`.slice(0, 30), videogameStatusId: 1 },
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
      await prisma.jurorSurveyResponse.deleteMany({
        where: { jurorId: { in: allUsers } },
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
      await prisma.jurorEdition.deleteMany({
        where: { jurorId: { in: allUsers } },
      });
      await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
      await prisma.user.deleteMany({ where: { id: { in: allUsers } } });
      await prisma.$disconnect();
    });

    // Un solo recorrido: cada paso depende del anterior.
    it('sin evaluar: no está disponible y no se puede responder', async () => {
      expect(await status(jurorA)).toMatchObject({
        editionId,
        available: false,
        reason: 'PENDING_EVALUATIONS',
        assigned: 2,
        evaluated: 0,
        answered: false,
      });
      const res = await server()
        .post('/juror-survey')
        .set(as(jurorA))
        .send(answer)
        .expect(403);
      expect(res.body).toMatchObject({
        code: 'SURVEY_NOT_AVAILABLE',
        reason: 'PENDING_EVALUATIONS',
      });
    });

    it('con una de dos evaluaciones enviadas sigue sin estar disponible', async () => {
      await submitEvaluation(0);
      expect(await status(jurorA)).toMatchObject({
        available: false,
        reason: 'PENDING_EVALUATIONS',
        evaluated: 1,
      });
    });

    it('al enviar la última evaluación pendiente, la encuesta aparece', async () => {
      await submitEvaluation(1);
      expect(await status(jurorA)).toMatchObject({
        available: true,
        reason: null,
        assigned: 2,
        evaluated: 2,
      });
    });

    it('si la omite, sigue disponible al volver a consultar (A1)', async () => {
      expect((await status(jurorA)).available).toBe(true);
      expect((await status(jurorA)).available).toBe(true);
    });

    it('valida el cuerpo: 400 con un campo fuera de rango, sin un campo o con comentario largo', async () => {
      await server()
        .post('/juror-survey')
        .set(as(jurorA))
        .send({ ...answer, stability: 6 })
        .expect(400);
      const { overall: _omit, ...missing } = answer;
      await server()
        .post('/juror-survey')
        .set(as(jurorA))
        .send(missing)
        .expect(400);
      await server()
        .post('/juror-survey')
        .set(as(jurorA))
        .send({ ...answer, comments: 'x'.repeat(1001) })
        .expect(400);
    });

    it('responde una vez; la segunda es 409 y el estado queda como respondida', async () => {
      const res = await server()
        .post('/juror-survey')
        .set(as(jurorA))
        .send(answer)
        .expect(201);
      expect(res.body.message).toMatch(/Gracias/);

      const again = await server()
        .post('/juror-survey')
        .set(as(jurorA))
        .send(answer)
        .expect(409);
      expect(again.body.code).toBe('SURVEY_ALREADY_ANSWERED');

      expect(await status(jurorA)).toMatchObject({
        available: false,
        reason: 'ALREADY_ANSWERED',
        answered: true,
      });
      const saved = await prisma.jurorSurveyResponse.findMany({
        where: { jurorId: jurorA },
      });
      expect(saved).toHaveLength(1);
      expect(saved[0].comments).toBe(answer.comments.trim());
    });

    it('quien no es jurado de la edición no puede responder', async () => {
      expect((await status(outsider)).reason).toBe('NOT_EDITION_JUROR');
      await server()
        .post('/juror-survey')
        .set(as(outsider))
        .send(answer)
        .expect(403);
    });

    it('un estudiante no tiene acceso a la encuesta ni a los resultados', async () => {
      await server().get('/juror-survey/status').set(as(ownerA)).expect(403);
      await server().get('/juror-survey/summary').set(as(ownerA)).expect(403);
    });

    it('el jurado no ve los resultados (solo el Administrador)', async () => {
      await server().get('/juror-survey/summary').set(as(jurorA)).expect(403);
      await server().get('/juror-survey/export').set(as(jurorA)).expect(403);
    });

    it('el administrador ve el resumen con el jurado junto a su comentario', async () => {
      const res = await server()
        .get(`/juror-survey/summary?editionId=${editionId}`)
        .set(as(adminId))
        .expect(200);
      expect(res.body.edition.id).toBe(editionId);
      expect(res.body.totals.responses).toBeGreaterThanOrEqual(1);
      expect(res.body.totals.jurorsFinished).toBeGreaterThanOrEqual(1);
      expect(res.body.fields).toHaveLength(6);
      expect(res.body.comments).toContainEqual(
        expect.objectContaining({
          email: `${jurorA}@uninorte.edu.co`,
          role: 'Jurado',
          comments: answer.comments.trim(),
        }),
      );
    });

    it('el administrador descarga el Excel con la respuesta del jurado', async () => {
      const res = await server()
        .get('/juror-survey/export')
        .set(as(adminId))
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toMatch(/encuesta_jurados_/);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as Buffer);
      const emails: unknown[] = [];
      workbook
        .getWorksheet('Respuestas')!
        .eachRow((row) => emails.push(row.getCell(2).value));
      expect(emails).toContain(`${jurorA}@uninorte.edu.co`);
      expect(workbook.getWorksheet('Resumen')).toBeDefined();
    });

    it('?editionId inválido: 400; edición inexistente: 404', async () => {
      await server()
        .get('/juror-survey/summary?editionId=abc')
        .set(as(adminId))
        .expect(400);
      await server()
        .get('/juror-survey/summary?editionId=999999')
        .set(as(adminId))
        .expect(404);
    });
  },
);
