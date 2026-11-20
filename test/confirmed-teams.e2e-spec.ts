import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  EditionStatus,
  JurorCategory,
  JurorEditionStatus,
  ManualJurorAssignmentAction,
  PrismaClient,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AssignmentPushNotifier } from '../src/push-notifications/assignment-push-notifier.service';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * BG-35 (ARK-158): solo los equipos confirmados entran a la asignación de jurados. Por HTTP contra
 * PostgreSQL real, con equipos pendiente, confirmado y rechazado en la edición activa.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Crea sus propios datos y no cambia estado compartido (las e2e pueden correr en paralelo).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

type TrackedTeam = { equipo?: { id: number }; id?: number; teamId?: number };

describeIfDb(
  'Solo equipos confirmados en la asignación (BG-35, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const userId = (name: string) => `it-ark158-${runId}-${name}`;
    const adminId = userId('admin');
    const jurorId = userId('juror');
    const owners = ['c', 'p', 'r', 'v'].map((k) => userId(`owner-${k}`));
    const allUsers = [adminId, jurorId, ...owners];
    const notify = jest.fn();

    let app: INestApplication;
    let editionId: number;
    let statusId: Record<'CONFIRMADO' | 'PENDIENTE' | 'RECHAZADO', number>;
    const team: Record<string, { id: number; videogameId: number }> = {};
    let criteria: number[] = [];

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const admin = () => as(adminId);
    const server = () => request(app.getHttpServer() as never);
    const setStatus = (id: number, videogameStatusId: number) =>
      server()
        .patch(`/teams/${id}`)
        .set(admin())
        .send({ videogame: { videogameStatusId } });
    const assign = (teamId: number) =>
      server()
        .post('/juror/assignments')
        .set(admin())
        .send({ jurorId, teamId, confirmWarnings: true });
    const trackedIds = async () => {
      const res = await server()
        .get('/juror/evaluation-tracking')
        .set(admin())
        .expect(200);
      return (res.body as TrackedTeam[]).map(
        (t) => t.equipo?.id ?? t.teamId ?? t.id,
      );
    };
    const dbJurors = async (id: number) =>
      (
        await prisma.team.findUniqueOrThrow({
          where: { id },
          include: { assignedJurors: { select: { id: true } } },
        })
      ).assignedJurors.map((j) => j.id);
    const pendingIds = async () => {
      const res = await server()
        .get('/pending-games?limit=100&page=1')
        .set(as(jurorId))
        .expect(200);
      return (res.body as { data: { videogameId: number }[] }).data.map(
        (g) => g.videogameId,
      );
    };
    const evaluation = (videogameId: number) => ({
      videogameId,
      comments: 'ok',
      details: criteria.map((criterionId) => ({
        criterionId,
        score: 4,
        isActive: true,
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:00:00.000Z',
      })),
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
          lastName: 'ARK158',
          jurorCategory: roleName === 'Jurado' ? JurorCategory.JUNIOR : null,
        },
      });
    };
    const createTeam = async (key: string, owner: string, status: number) => {
      const created = await prisma.team.create({
        data: {
          teamName: `it-ark158-${runId}-${key}`,
          userId: owner,
          editionId,
          teamCode: `N1-${key}-${runId.slice(-5)}`,
          videogame: {
            create: {
              name: `it-158-${key}-${runId}`.slice(0, 30),
              videogameStatusId: status,
            },
          },
        },
        include: { videogame: true },
      });
      team[key] = { id: created.id, videogameId: created.videogame!.id };
    };

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      editionId = (
        await prisma.edition.findFirstOrThrow({
          where: { status: EditionStatus.ACTIVE },
          orderBy: { id: 'desc' },
        })
      ).id;
      const statuses = await prisma.videogameStatus.findMany();
      statusId = Object.fromEntries(
        statuses.map((s) => [s.status, s.id]),
      ) as typeof statusId;
      criteria = (
        await prisma.criterion.findMany({
          where: { isActive: true },
          select: { id: true },
        })
      ).map((c) => c.id);

      await createUser(adminId, 'Administrador');
      await createUser(jurorId, 'Jurado');
      for (const owner of owners) await createUser(owner, 'Estudiante');
      await prisma.jurorEdition.create({
        data: { jurorId, editionId, status: JurorEditionStatus.CONFIRMED },
      });
      await createTeam('C', owners[0], statusId.CONFIRMADO);
      await createTeam('P', owners[1], statusId.PENDIENTE);
      await createTeam('R', owners[2], statusId.RECHAZADO);
      await createTeam('V', owners[3], statusId.CONFIRMADO);

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(AzureStorageService)
        .useValue({})
        .overrideProvider(AssignmentPushNotifier)
        .useValue({
          notifyAssignmentChanged: notify,
          notifyTeamsAssigned: jest.fn(),
        })
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
      const teamIds = Object.values(team).map((t) => t.id);
      const gameIds = Object.values(team).map((t) => t.videogameId);
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
      await prisma.teamVerification.deleteMany({
        where: { teamId: { in: teamIds } },
      });
      await prisma.jurorAssignmentAuditLog.deleteMany({
        where: { actorUserId: adminId },
      });
      await prisma.jurorEdition.deleteMany({ where: { jurorId } });
      await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
      await prisma.user.deleteMany({ where: { id: { in: allUsers } } });
      await prisma.$disconnect();
    });

    // Un solo recorrido: cada paso depende del anterior.
    it('la pantalla de asignación y el diálogo solo muestran los confirmados', async () => {
      const ids = await trackedIds();
      expect(ids).toContain(team.C.id);
      expect(ids).not.toContain(team.P.id);
      expect(ids).not.toContain(team.R.id);

      const dialog = await server()
        .get('/teams/incomplete-jurors')
        .set(admin())
        .expect(200);
      const dialogIds = (dialog.body as { id: number }[]).map((t) => t.id);
      expect(dialogIds).toContain(team.C.id);
      expect(dialogIds).not.toContain(team.P.id);
      expect(dialogIds).not.toContain(team.R.id);
    });

    it.each(['P', 'R'])(
      'no se le pueden asignar jurados al equipo %s',
      async (key) => {
        const res = await assign(team[key].id).expect(400);
        expect(res.body).toMatchObject({
          code: 'TEAM_NOT_CONFIRMED',
          teamId: team[key].id,
        });
        expect(await dbJurors(team[key].id)).toEqual([]);
      },
    );

    it('el seguimiento y las alertas no incluyen a los no confirmados', async () => {
      const res = await server()
        .get('/evaluation-tracking')
        .set(admin())
        .expect(200);
      const text = JSON.stringify(res.body);
      expect(text).toContain(`N1-C-${runId.slice(-5)}`);
      expect(text).not.toContain(`N1-P-${runId.slice(-5)}`);
      expect(text).not.toContain(`N1-R-${runId.slice(-5)}`);
    });

    it('el confirmado se asigna y el jurado lo ve en pendientes', async () => {
      await assign(team.C.id).expect(201);
      await assign(team.V.id).expect(201);
      expect(await pendingIds()).toEqual(
        expect.arrayContaining([team.C.videogameId, team.V.videogameId]),
      );
    });

    it('al rechazar se retiran los jurados, se avisa y queda en la bitácora; la evaluación no se borra', async () => {
      await prisma.evaluation.create({
        data: {
          jurorId,
          videogameId: team.C.videogameId,
          editionId,
          totalScore: 4,
          details: { create: [{ criterionId: criteria[0], score: 4 }] },
        },
      });
      notify.mockClear();

      const res = await setStatus(team.C.id, statusId.RECHAZADO).expect(200);

      expect(res.body.juradosRetirados).toEqual([
        { id: jurorId, nombre: 'IT ARK158' },
      ]);
      expect(res.body.avisoAsignacion).toContain('1 jurado(s)');
      expect(await dbJurors(team.C.id)).toEqual([]);
      expect(notify).toHaveBeenCalledWith([jurorId]);
      expect(
        await prisma.jurorAssignmentAuditLog.count({
          where: {
            teamId: team.C.id,
            jurorId,
            actorUserId: adminId,
            action: ManualJurorAssignmentAction.UNASSIGN,
          },
        }),
      ).toBe(1);
      expect(await trackedIds()).not.toContain(team.C.id);
      expect(
        await prisma.evaluation.count({
          where: { videogameId: team.C.videogameId },
        }),
      ).toBe(1);
    });

    it('al volver a confirmarlo reaparece sin jurados y se asigna validando de nuevo', async () => {
      const res = await setStatus(team.C.id, statusId.CONFIRMADO).expect(200);
      expect(res.body.juradosRetirados).toBeUndefined();
      expect(await dbJurors(team.C.id)).toEqual([]);
      expect(await trackedIds()).toContain(team.C.id);
      await assign(team.C.id).expect(201);
    });

    it('con PENDIENTE conserva los jurados, sale de las listas y no se puede calificar', async () => {
      const res = await setStatus(team.V.id, statusId.PENDIENTE).expect(200);
      expect(res.body.juradosRetirados).toBeUndefined();
      expect(await dbJurors(team.V.id)).toEqual([jurorId]);
      expect(await trackedIds()).not.toContain(team.V.id);
      expect(await pendingIds()).not.toContain(team.V.videogameId);

      const denied = await server()
        .post('/evaluation/with-details')
        .set(as(jurorId))
        .send(evaluation(team.V.videogameId))
        .expect(403);
      expect(denied.body.message).toBe(
        'La inscripción de este grupo no está confirmada',
      );

      await setStatus(team.V.id, statusId.CONFIRMADO).expect(200);
      expect(await dbJurors(team.V.id)).toEqual([jurorId]);
      expect(await pendingIds()).toContain(team.V.videogameId);
    });

    it('rechazar por PATCH /videogames/:id también retira los jurados', async () => {
      notify.mockClear();
      const res = await server()
        .patch(`/videogames/${team.V.videogameId}`)
        .set(admin())
        .send({ videogameStatusId: statusId.RECHAZADO })
        .expect(200);
      expect(res.body.juradosRetirados).toEqual([
        { id: jurorId, nombre: 'IT ARK158' },
      ]);
      expect(await dbJurors(team.V.id)).toEqual([]);
      expect(notify).toHaveBeenCalledWith([jurorId]);
    });
  },
);
