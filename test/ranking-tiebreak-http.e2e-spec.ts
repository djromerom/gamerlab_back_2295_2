import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { EditionStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-47 (ARK-304) por HTTP contra PostgreSQL real, con la aplicación completa (guards y permisos
 * del seed): los empates se resuelven siempre por fecha de inscripción (y por id si la fecha
 * coincide), ya no existen `GET /ranking/my-ties` ni `POST /ranking/ties/decision`, y el cierre
 * registra los desempates por inscripción.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Crea su propia edición (inactiva) y borra al final lo que generó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

type Tie = {
  tieKey: string;
  level: number;
  rule: string;
  status: string;
  deciders: unknown[];
  decision: unknown;
  order: number[];
  explanation: string;
};
type Level = {
  level: number;
  teams: { teamId: number; position: number; provisional: boolean }[];
  ties: Tie[];
};

describeIfDb('Desempate por inscripción (HU-47, HTTP + PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: url ?? 'postgresql://unused' } },
  });
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const runId = Date.now().toString(36).slice(-5);
  const userIds: string[] = [];
  const nrcIds: number[] = [];
  const team: Record<string, number> = {};
  let app: INestApplication;
  let editionId: number;
  let subjectId: number;
  let adminId: string;
  let profA: string;
  let profB: string;
  const jurors: string[] = [];

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
        id: `it-ark304-${runId}-${suffix}`,
        email: `it-ark304-${runId}-${suffix}@uninorte.edu.co`,
        roleId: r.id,
        firstName: 'IT',
        lastName: suffix,
      },
    });
    userIds.push(u.id);
    return u.id;
  }

  async function nrc(professorId: string) {
    const n = await prisma.nRC.create({
      data: { code: 990000 + nrcIds.length, subjectId, professorId, editionId },
    });
    nrcIds.push(n.id);
    return n.id;
  }

  /** Equipo con 3 notas de jurado iguales (la nota final es esa, regla congelada). */
  async function createTeam(
    key: string,
    level: number,
    nrcId: number,
    registrationDate: Date,
    score: number,
  ) {
    const owner = await user(`own-${key}`, 'Estudiante');
    const t = await prisma.team.create({
      data: {
        teamName: `it-ark304-${runId}-${key}`,
        userId: owner,
        editionId,
        teamCode: `N${level}-IT-${runId}${key}`.slice(0, 12),
        registrationDate,
        videogame: { create: { name: `it-ark304-${runId}-${key}` } },
        members: {
          create: {
            firstName: 'IT',
            lastName: key,
            email: `it-ark304-${runId}-mem-${key}@uninorte.edu.co`,
            studentCode: `it304${runId}${key}`,
            editionId,
            nrcs: { connect: { id: nrcId } },
          },
        },
      },
      include: { videogame: true },
    });
    team[key] = t.id;
    for (let i = 0; i < 3; i++) {
      await prisma.evaluation.create({
        data: {
          jurorId: jurors[i],
          videogameId: t.videogame!.id,
          editionId,
          totalScore: score,
          isSenior: false,
          isActive: true,
          date: new Date(Date.UTC(2098, 0, 20, 10, i)),
        },
      });
    }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const edition = await prisma.edition.create({
      data: {
        year: 2098,
        semester: 10 + (Date.now() % 7),
        title: `it-ark304-${runId}`,
        startsAt: new Date(Date.UTC(2098, 0, 1)),
        endsAt: new Date(Date.UTC(2098, 0, 31)),
        status: EditionStatus.INACTIVE,
        legacyFinalScoreRule: true,
      },
    });
    editionId = edition.id;
    await prisma.weighting.create({
      data: { editionId, juniorPct: 40, seniorPct: 60 },
    });
    subjectId = (
      await prisma.subject.create({
        data: {
          name: `it-ark304-${runId}`,
          code: `IT304${runId}`,
          semester: 1,
        },
      })
    ).id;

    adminId = await user('admin', 'Administrador');
    profA = await user('pa', 'Profesor');
    profB = await user('pb', 'Profesor');
    for (let i = 0; i < 3; i++) jurors.push(await user(`j${i}`, 'Jurado'));
    const nrcA = await nrc(profA);
    const nrcB = await nrc(profB);

    const day = (d: number) => new Date(Date.UTC(2098, 0, d, 15));
    // N1: A y B del mismo profesor, empatados en 4. Antes decidía el profesor; ahora B (día 3) va
    // antes que A (día 5).
    await createTeam('A', 1, nrcA, day(5), 4);
    await createTeam('B', 1, nrcA, day(3), 4);
    await createTeam('C', 1, nrcB, day(1), 4.8);
    // N2: D y E de profesores distintos con la MISMA fecha: antes quedaba para el administrador;
    // ahora decide el id (D se crea primero, así que tiene el id menor).
    await createTeam('D', 2, nrcA, day(2), 3.5);
    await createTeam('E', 2, nrcB, day(2), 3.5);

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
      await prisma.evaluation.deleteMany({ where: { editionId } });
      await prisma.team.deleteMany({ where: { editionId } });
      await prisma.nRC.deleteMany({ where: { id: { in: nrcIds } } });
      await prisma.tieBreakDecision.deleteMany({ where: { editionId } });
      await prisma.rankingResult.deleteMany({ where: { editionId } });
      await prisma.weighting.deleteMany({ where: { editionId } });
      await prisma.edition.delete({ where: { id: editionId } });
    }
    if (subjectId) await prisma.subject.delete({ where: { id: subjectId } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('GET /ranking: empates resueltos por inscripción y por id, sin pendientes', async () => {
    const res = await server()
      .get(`/ranking?editionId=${editionId}`)
      .set(as(adminId))
      .expect(200);
    const body = res.body as { pendingTies: number; levels: Level[] };
    expect(body.pendingTies).toBe(0);
    const [n1, n2] = body.levels;
    expect(n1.teams.map((t) => t.teamId)).toEqual([team.C, team.B, team.A]);
    expect(n1.teams.every((t) => !t.provisional)).toBe(true);
    expect(n1.ties[0]).toMatchObject({
      rule: 'REGISTRATION',
      status: 'RESOLVED',
      deciders: [],
      decision: null,
      order: [team.B, team.A],
    });
    expect(n2.teams.map((t) => t.teamId)).toEqual([team.D, team.E]);
    expect(n2.ties[0]).toMatchObject({
      rule: 'REGISTRATION',
      status: 'RESOLVED',
      order: [team.D, team.E],
    });
    expect(n2.ties[0].explanation).toContain('misma fecha');
  });

  it('GET /ranking/ties?status=PENDING no devuelve nada', async () => {
    const res = await server()
      .get(`/ranking/ties?editionId=${editionId}&status=PENDING`)
      .set(as(adminId))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('GET /ranking/winners muestra el podio por inscripción', async () => {
    const res = await server()
      .get(`/ranking/winners?editionId=${editionId}&level=1`)
      .set(as(adminId))
      .expect(200);
    const body = res.body as {
      levels: { podium: { teamId: number }[]; pendingTies: number }[];
    };
    expect(body.levels[0].podium.map((t) => t.teamId)).toEqual([
      team.C,
      team.B,
      team.A,
    ]);
    expect(body.levels[0].pendingTies).toBe(0);
  });

  it.each([
    ['GET', '/ranking/my-ties'],
    ['POST', '/ranking/ties/decision'],
  ])(
    '%s %s ya no existe (404) para profesor ni administrador',
    async (method, path) => {
      for (const who of [profA, adminId]) {
        const req =
          method === 'GET'
            ? server().get(path)
            : server().post(path).send({ tieKey: 'x', useRegistration: true });
        await req.set(as(who)).expect(404);
      }
    },
  );

  it('el profesor no ve el ranking del administrador (403)', async () => {
    await server()
      .get(`/ranking?editionId=${editionId}`)
      .set(as(profA))
      .expect(403);
  });

  it('una decisión vieja no cambia el orden y el cierre registra los desempates por inscripción', async () => {
    const [n1] = (
      (
        await server()
          .get(`/ranking?editionId=${editionId}&level=1`)
          .set(as(adminId))
      ).body as { levels: Level[] }
    ).levels;
    await prisma.tieBreakDecision.create({
      data: {
        editionId,
        level: 1,
        score: 4,
        tieKey: n1.ties[0].tieKey,
        teamIds: [team.A, team.B],
        orderedTeamIds: [team.A, team.B],
        method: 'PROFESSOR',
        reason: 'Decisión anterior a HU-47',
        decidedById: profA,
      },
    });
    const again = await server()
      .get(`/ranking?editionId=${editionId}&level=1`)
      .set(as(adminId))
      .expect(200);
    expect(
      (again.body as { levels: Level[] }).levels[0].teams.map((t) => t.teamId),
    ).toEqual([team.C, team.B, team.A]);

    const done = await server()
      .post(`/ranking/finalize?editionId=${editionId}`)
      .set(as(adminId))
      .expect(200);
    expect(done.body).toMatchObject({ teams: 5, registeredDecisions: 1 });

    const saved = await prisma.rankingResult.findMany({
      where: { editionId },
      orderBy: [{ level: 'asc' }, { finalPosition: 'asc' }],
    });
    expect(saved.map((s) => s.teamId)).toEqual([
      team.C,
      team.B,
      team.A,
      team.D,
      team.E,
    ]);

    const decisions = await server()
      .get(`/ranking/decisions?editionId=${editionId}`)
      .set(as(adminId))
      .expect(200);
    expect(
      (decisions.body as { method: string }[]).map((d) => d.method).sort(),
    ).toEqual(['PROFESSOR', 'REGISTRATION']);

    const repeat = await server()
      .post(`/ranking/finalize?editionId=${editionId}`)
      .set(as(adminId))
      .expect(200);
    expect(repeat.body).toMatchObject({ registeredDecisions: 0 });
  });
});
