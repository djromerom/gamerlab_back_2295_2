import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { findActiveEdition } from '../src/editions/active-edition';
import { fairInstant } from '../src/jurors/absence-alert/fair-schedule';
import { REJECTED_VIDEOGAME_STATUS } from '../src/teams/team-status';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-46 (ARK-301) por HTTP contra PostgreSQL real, con la aplicación completa (guards y permisos
 * del seed): el método de `/final-grade/release` (PATCH, el que usa el front; PUT no existe), la
 * regla de la hora de cierre del cronograma y la respuesta de `/final-grade/me` con BG-43 (equipo
 * rechazado), BG-48 (equipo sin nota completa) y BG-67 (ocultar la nota oculta el ranking).
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed (con
 * una edición activa). Crea equipos N7 en la edición activa, cambia el cronograma y la
 * configuración del evento durante la prueba y al final deja todo como estaba.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

type ReleaseStatus = {
  showFinalGrade: boolean;
  releasedAt: string | null;
  fairDate: string;
  releaseTime: string;
  scheduleConfigured: boolean;
  releaseAllowedFrom: string;
  canReleaseNow: boolean;
  incompleteTeams: { teamId: number; inProcess: boolean }[];
};

/** Día en Colombia (`YYYY-MM-DD`) corrido `days` días desde hoy. */
function bogotaDay(days: number): string {
  return new Date(Date.now() - 5 * 3_600_000 + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

describeIfDb('Liberar la nota final (HU-46, HTTP + PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: url ?? 'postgresql://unused' } },
  });
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const runId = Date.now().toString(36).slice(-5);
  const userIds: string[] = [];
  const team: Record<string, number> = {};
  const owner: Record<string, string> = {};
  let app: INestApplication;
  let editionId: number;
  let adminId: string;
  let professorId: string;
  const jurors: string[] = [];
  let savedConfig: {
    showRanking: boolean;
    showFinalGrade: boolean;
    finalGradeReleasedAt: Date | null;
  } | null = null;
  let savedSchedule: {
    fairDate: Date;
    startTime: string;
    alertTime: string;
    controlTime: string;
    closeTime: string;
  } | null = null;

  const as = (sub: string) => ({
    Cookie: `access-token=${jwt.sign(
      { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
      { expiresIn: 900 },
    )}`,
  });
  const server = () => request(app.getHttpServer() as never);

  async function user(suffix: string, role: string) {
    const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    const u = await prisma.user.create({
      data: {
        id: `it-ark301-${runId}-${suffix}`,
        email: `it-ark301-${runId}-${suffix}@uninorte.edu.co`,
        roleId: r.id,
        firstName: 'IT',
        lastName: suffix,
      },
    });
    userIds.push(u.id);
    return u.id;
  }

  /** Equipo N7 con 3 notas de jurado junior y, si `professor`, 1 de profesor. */
  async function createTeam(
    key: string,
    score: number,
    opts: { professor: boolean; statusId?: number },
  ) {
    owner[key] = await user(`own-${key}`, 'Estudiante');
    const t = await prisma.team.create({
      data: {
        teamName: `it-ark301-${runId}-${key}`,
        userId: owner[key],
        editionId,
        teamCode: `N7-IT-${runId}${key}`.slice(0, 14),
        registrationDate: new Date(Date.UTC(2026, 9, 1, 15)),
        videogame: {
          create: {
            name: `it-ark301-${runId}-${key}`,
            ...(opts.statusId ? { videogameStatusId: opts.statusId } : {}),
          },
        },
      },
      include: { videogame: true },
    });
    team[key] = t.id;
    const evaluators = [
      ...jurors.map((j) => [j, false] as const),
      ...(opts.professor ? [[professorId, true] as const] : []),
    ];
    for (const [i, [jurorId, isSenior]] of evaluators.entries()) {
      await prisma.evaluation.create({
        data: {
          jurorId,
          videogameId: t.videogame!.id,
          editionId,
          totalScore: score,
          isSenior,
          isActive: true,
          date: new Date(Date.UTC(2026, 10, 1, 10, i)),
        },
      });
    }
  }

  async function setSchedule(fairDate: string, closeTime = '12:00') {
    const data = {
      fairDate: new Date(`${fairDate}T00:00:00.000Z`),
      startTime: '08:00',
      alertTime: '09:00',
      controlTime: '10:00',
      closeTime,
    };
    await prisma.fairSchedule.upsert({
      where: { editionId },
      update: data,
      create: { editionId, ...data },
    });
  }

  const release = (show: boolean, who = adminId) =>
    server().patch('/final-grade/release').set(as(who)).send({ show });
  const myGrade = async (key: string) =>
    (await server().get('/final-grade/me').set(as(owner[key])).expect(200))
      .body as Record<string, unknown>;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const active = await findActiveEdition(prisma);
    if (!active)
      throw new Error('La base de prueba necesita una edición activa');
    editionId = active.id;

    savedConfig = await prisma.eventConfiguration.findUnique({
      where: { editionId },
      select: {
        showRanking: true,
        showFinalGrade: true,
        finalGradeReleasedAt: true,
      },
    });
    savedSchedule = await prisma.fairSchedule.findUnique({
      where: { editionId },
      select: {
        fairDate: true,
        startTime: true,
        alertTime: true,
        controlTime: true,
        closeTime: true,
      },
    });
    await prisma.eventConfiguration.upsert({
      where: { editionId },
      update: {
        showRanking: false,
        showFinalGrade: false,
        finalGradeReleasedAt: null,
      },
      create: { editionId },
    });

    adminId = await user('admin', 'Administrador');
    professorId = await user('prof', 'Profesor');
    for (let i = 0; i < 3; i++) jurors.push(await user(`j${i}`, 'Jurado'));
    const rejected = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: REJECTED_VIDEOGAME_STATUS },
    });

    // A: completo. B: rechazado (BG-43). C: sin nota del profesor, «en proceso» (BG-48).
    await createTeam('A', 4.125, { professor: true });
    await createTeam('B', 4.8, { professor: true, statusId: rejected.id });
    await createTeam('C', 3.9, { professor: false });

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
    if (editionId) {
      if (savedConfig) {
        await prisma.eventConfiguration.update({
          where: { editionId },
          data: savedConfig,
        });
      } else {
        await prisma.eventConfiguration.deleteMany({ where: { editionId } });
      }
      if (savedSchedule) {
        await prisma.fairSchedule.update({
          where: { editionId },
          data: savedSchedule,
        });
      } else {
        await prisma.fairSchedule.deleteMany({ where: { editionId } });
      }
      const ids = Object.values(team);
      await prisma.evaluation.deleteMany({
        where: { videogame: { teamId: { in: ids } } },
      });
      await prisma.team.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('el método es PATCH: PUT responde 404, sin sesión 401 y el estudiante 403', async () => {
    await server()
      .put('/final-grade/release')
      .set(as(adminId))
      .send({ show: true })
      .expect(404);
    await server()
      .patch('/final-grade/release')
      .send({ show: true })
      .expect(401);
    await release(true, owner.A).expect(403);
    await server().get('/final-grade/release').set(as(owner.A)).expect(403);
  });

  it('antes de la hora de cierre del cronograma no se libera y no cambia nada', async () => {
    const tomorrow = bogotaDay(1);
    await setSchedule(tomorrow, '12:00');
    const allowedFrom = fairInstant(tomorrow, '12:00').toISOString();

    const status = (
      await server().get('/final-grade/release').set(as(adminId)).expect(200)
    ).body as ReleaseStatus;
    expect(status).toMatchObject({
      showFinalGrade: false,
      fairDate: tomorrow,
      releaseTime: '12:00',
      scheduleConfigured: true,
      releaseAllowedFrom: allowedFrom,
      canReleaseNow: false,
    });

    const res = await release(true).expect(400);
    expect(res.body).toMatchObject({
      code: 'FINAL_GRADE_RELEASE_TOO_EARLY',
      releaseAllowedFrom: allowedFrom,
    });
    expect(String((res.body as { message: string }).message)).toContain(
      '(hora de Colombia)',
    );
    const cfg = await prisma.eventConfiguration.findUniqueOrThrow({
      where: { editionId },
    });
    expect(cfg.showFinalGrade).toBe(false);
    expect(await myGrade('A')).toMatchObject({
      released: false,
      status: 'NOT_RELEASED',
      finalGrade: null,
    });
  });

  it('el aviso de incompletos lista al equipo en proceso y no al rechazado', async () => {
    await setSchedule(bogotaDay(-1));
    const status = (
      await server().get('/final-grade/release').set(as(adminId)).expect(200)
    ).body as ReleaseStatus;
    expect(status.canReleaseNow).toBe(true);
    const mine = status.incompleteTeams.filter((t) =>
      Object.values(team).includes(t.teamId),
    );
    expect(mine).toEqual([
      expect.objectContaining({ teamId: team.C, inProcess: true }),
    ]);
  });

  it('desde la hora de cierre se libera y /final-grade/me responde según el equipo', async () => {
    const res = await release(true).expect(200);
    expect(res.body).toMatchObject({ showFinalGrade: true });
    expect((res.body as ReleaseStatus).releasedAt).not.toBeNull();

    const row = await prisma.teamFinalScore.findFirstOrThrow({
      where: { teamId: team.A, editionId },
    });
    const a = await myGrade('A');
    expect(Object.keys(a).sort()).toEqual(
      ['editionId', 'finalGrade', 'released', 'status', 'team'].sort(),
    );
    expect(a).toMatchObject({
      editionId,
      team: { id: team.A },
      released: true,
      status: 'AVAILABLE',
      finalGrade: Math.round(Number(row.finalScore) * 100) / 100,
    });
    expect(String(a.finalGrade)).toMatch(/^\d+(\.\d{1,2})?$/);

    expect(await myGrade('B')).toMatchObject({
      released: true,
      status: 'REJECTED',
      finalGrade: null,
    });
    expect(await myGrade('C')).toMatchObject({
      released: true,
      status: 'IN_PROCESS',
      finalGrade: null,
    });
  });

  it('ocultar la nota también oculta el ranking público (BG-67)', async () => {
    await server()
      .patch('/settings/show-ranking')
      .set(as(adminId))
      .send({ show: true })
      .expect(200);
    expect(
      (await server().get('/settings/show-ranking').expect(200)).body,
    ).toEqual({ showRanking: true });

    const res = await release(false).expect(200);
    expect(res.body).toMatchObject({ showFinalGrade: false, releasedAt: null });
    expect(
      (await server().get('/settings/show-ranking').expect(200)).body,
    ).toEqual({ showRanking: false });
    expect(await myGrade('A')).toMatchObject({
      released: false,
      status: 'NOT_RELEASED',
      finalGrade: null,
    });

    const again = await server()
      .patch('/settings/show-ranking')
      .set(as(adminId))
      .send({ show: true })
      .expect(400);
    expect(again.body).toMatchObject({ code: 'RANKING_REQUIRES_FINAL_GRADE' });
  });
});
