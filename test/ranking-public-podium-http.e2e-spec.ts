import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { findActiveEdition } from '../src/editions/active-edition';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-48 (ARK-306) por HTTP contra PostgreSQL real: `GET /teams/final-score/by-n/:n` (ranking
 * público) devuelve solo el podio de cada nivel, ya desempatado por inscripción (HU-47), y sin
 * ninguna nota, a cualquier rol. El Administrador sigue viendo todo con nota en `GET /ranking`.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed (con
 * una edición activa). Crea equipos de un nivel que no usa el seed (N7) en la edición activa,
 * publica el ranking durante la prueba y al final deja la configuración como estaba y borra lo que
 * creó.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

const SCORE_FIELDS = [
  'finalScore',
  'avgJunior',
  'avgSenior',
  'rankingScore',
  'tieBreakerScore',
  'jurorTieBreakerScore',
  'professorTieBreakerScore',
];

describeIfDb('Podio público sin notas (HU-48, HTTP + PostgreSQL)', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: url ?? 'postgresql://unused' } },
  });
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const runId = Date.now().toString(36).slice(-5);
  const userIds: string[] = [];
  const team: Record<string, number> = {};
  const videogameOf: Record<string, number> = {};
  let app: INestApplication;
  let editionId: number;
  let adminId: string;
  let studentId: string;
  let professorId: string;
  const jurors: string[] = [];
  let savedConfig: { showRanking: boolean; showFinalGrade: boolean } | null =
    null;

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
        id: `it-ark306-${runId}-${suffix}`,
        email: `it-ark306-${runId}-${suffix}@uninorte.edu.co`,
        roleId: r.id,
        firstName: 'IT',
        lastName: suffix,
      },
    });
    userIds.push(u.id);
    return u.id;
  }

  /** Equipo N7 con 3 notas de jurado y 1 de profesor iguales: la nota final es `score`. */
  async function createTeam(key: string, day: number, score: number | null) {
    const owner = await user(`own-${key}`, 'Estudiante');
    const t = await prisma.team.create({
      data: {
        teamName: `it-ark306-${runId}-${key}`,
        userId: owner,
        editionId,
        teamCode: `N7-IT-${runId}${key}`.slice(0, 14),
        registrationDate: new Date(Date.UTC(2026, 9, day, 15)),
        videogame: { create: { name: `it-ark306-${runId}-${key}` } },
      },
      include: { videogame: true },
    });
    team[key] = t.id;
    videogameOf[key] = t.videogame!.id;
    if (score === null) return;
    const evaluators = [
      ...jurors.map((j) => [j, false] as const),
      [professorId, true] as const,
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

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const active = await findActiveEdition(prisma);
    if (!active)
      throw new Error('La base de prueba necesita una edición activa');
    editionId = active.id;

    adminId = await user('admin', 'Administrador');
    studentId = await user('student', 'Estudiante');
    professorId = await user('prof', 'Profesor');
    for (let i = 0; i < 3; i++) jurors.push(await user(`j${i}`, 'Jurado'));

    // A 4.9; B y C empatan en 4.5 (C se inscribió antes); D 4.0 y E 3.0 quedan fuera del podio;
    // F no tiene notas.
    await createTeam('A', 5, 4.9);
    await createTeam('B', 3, 4.5);
    await createTeam('C', 1, 4.5);
    await createTeam('D', 2, 4);
    await createTeam('E', 4, 3);
    await createTeam('F', 6, null);

    const cfg = await prisma.eventConfiguration.findUnique({
      where: { editionId },
      select: { showRanking: true, showFinalGrade: true },
    });
    savedConfig = cfg;
    await prisma.eventConfiguration.upsert({
      where: { editionId },
      update: { showRanking: true, showFinalGrade: true },
      create: { editionId, showRanking: true, showFinalGrade: true },
    });

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

  const podiumOf = async (path: string, who?: string) => {
    const req = server().get(path);
    const res = await (who ? req.set(as(who)) : req).expect(200);
    return (res.body as Record<string, unknown>[]).filter((r) =>
      Object.values(team).includes(Number(r.teamId)),
    );
  };

  it.each([
    ['sin sesión', undefined],
    ['estudiante', 'student'],
    ['profesor', 'prof'],
    ['administrador', 'admin'],
  ])(
    '%s: solo los 3 primeros del nivel, desempatados y sin notas',
    async (_n, who) => {
      const id =
        who === 'student'
          ? studentId
          : who === 'prof'
            ? professorId
            : who === 'admin'
              ? adminId
              : undefined;
      const rows = await podiumOf('/teams/final-score/by-n/N7', id);
      expect(rows.map((r) => [r.teamId, r.levelPosition, r.position])).toEqual([
        [team.A, 1, 1],
        [team.C, 2, 2],
        [team.B, 3, 3],
      ]);
      for (const r of rows) {
        expect(r).toMatchObject({ level: 7, editionId });
        for (const field of SCORE_FIELDS) expect(r).not.toHaveProperty(field);
      }
    },
  );

  it('`all` también trae solo el podio de N7, sin notas', async () => {
    const rows = await podiumOf('/teams/final-score/by-n/all');
    expect(rows.map((r) => r.teamId)).toEqual([team.A, team.C, team.B]);
    for (const r of rows) expect(r).not.toHaveProperty('finalScore');
  });

  it('el Administrador sigue viendo el nivel completo con notas en GET /ranking', async () => {
    const res = await server()
      .get('/ranking?level=7')
      .set(as(adminId))
      .expect(200);
    const [n7] = (
      res.body as {
        levels: { teams: { teamId: number; finalScore: number }[] }[];
      }
    ).levels;
    const mine = n7.teams.filter((t) => Object.values(team).includes(t.teamId));
    expect(mine.map((t) => [t.teamId, t.finalScore])).toEqual([
      [team.A, 4.9],
      [team.C, 4.5],
      [team.B, 4.5],
      [team.D, 4],
      [team.E, 3],
    ]);
  });

  // Revisión de #321: estas dos rutas eran públicas y devolvían la nota de cualquier equipo.
  describe.each([
    ['final-score/team', () => `/teams/final-score/team/${team.A}`],
    [
      'final-score/videogame',
      () => `/teams/final-score/videogame/${videogameOf.A}`,
    ],
  ])('%s: solo el Administrador', (_name, path) => {
    it('sin sesión responde 401 y no trae ninguna nota', async () => {
      const res = await server().get(path()).expect(401);
      expect(JSON.stringify(res.body)).not.toContain('finalScore');
    });

    it.each([
      ['estudiante', () => studentId],
      ['profesor', () => professorId],
    ])('%s responde 403 y no trae ninguna nota', async (_n, who) => {
      const res = await server().get(path()).set(as(who())).expect(403);
      expect(JSON.stringify(res.body)).not.toContain('finalScore');
    });

    it('el Administrador recibe la nota final', async () => {
      const res = await server().get(path()).set(as(adminId)).expect(200);
      expect(
        (res.body as { teamId: number; finalScore: number }[]).map((r) => [
          r.teamId,
          r.finalScore,
        ]),
      ).toEqual([[team.A, 4.9]]);
    });
  });

  it('con el ranking oculto, sin sesión responde [] y el Administrador ve el podio', async () => {
    await prisma.eventConfiguration.update({
      where: { editionId },
      data: { showRanking: false },
    });
    expect(await podiumOf('/teams/final-score/by-n/N7')).toEqual([]);
    expect(
      (await podiumOf('/teams/final-score/by-n/N7', adminId)).map(
        (r) => r.teamId,
      ),
    ).toEqual([team.A, team.C, team.B]);
    await prisma.eventConfiguration.update({
      where: { editionId },
      data: { showRanking: true },
    });
  });
});
