import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  EditionStatus,
  JurorCategory,
  JurorEditionStatus,
  JurorType,
  PrismaClient,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-24 (ARK-217): botón «Asignar grupos automáticamente» por HTTP contra PostgreSQL real, con la
 * aplicación completa (guards, permisos del seed, reglas de HU-08, bitácora y aviso de HU-22).
 * Usa equipos propios de nivel 8 y 7 (el seed no los tiene) y uno de colegios (N0).
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
  'Asignación automática de grupos al suplente (HU-24, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const userId = (name: string) => `it-ark217a-${runId}-${name}`;
    const [adminId, staffId, jurorId, enrolledId, substituteId] = [
      'admin',
      'staff',
      'juror',
      'enrolled',
      'substitute',
    ].map(userId);
    const fixtures = [adminId, staffId, jurorId, enrolledId, substituteId];
    /** Equipos propios: N8 (nivel que el seed no usa), uno N7 y uno de colegios (N0). */
    const teams: Record<string, number> = {};
    const owners: string[] = [];

    let app: INestApplication;
    let editionId: number;

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const server = () => request(app.getHttpServer() as never);
    const suggestion = (maxTeams?: number) =>
      server()
        .get(`/walk-in-jurors/${substituteId}/team-suggestion`)
        .query(maxTeams ? { maxTeams } : {})
        .set(as(adminId));
    const assign = (body: Record<string, unknown>, sub = adminId) =>
      server()
        .post(`/walk-in-jurors/${substituteId}/assignments`)
        .set(as(sub))
        .send(body);
    const jurorsOf = async (code: string) =>
      (
        await prisma.team.findUniqueOrThrow({
          where: { id: teams[code] },
          include: { assignedJurors: { select: { id: true } } },
        })
      ).assignedJurors
        .map((j) => j.id)
        .sort();

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
          lastName: `ARK217 ${id.split('-').pop()}`,
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

      await createUser(adminId, 'Administrador');
      await createUser(staffId, 'Staff');
      // Pedro: cuenta de jurado que no es de la edición. Carlos: oficial confirmado.
      await createUser(jurorId, 'Jurado');
      await createUser(enrolledId, 'Jurado');
      // El suplente junior confirmado al que se le asignan grupos.
      await createUser(substituteId, 'Jurado');
      await prisma.jurorEdition.createMany({
        data: [
          {
            jurorId: enrolledId,
            editionId,
            status: JurorEditionStatus.CONFIRMED,
            type: JurorType.OFFICIAL,
          },
          {
            jurorId: substituteId,
            editionId,
            status: JurorEditionStatus.CONFIRMED,
            type: JurorType.BACKUP,
          },
        ],
      });

      // N8-A tiene 2 asignados, pero Pedro no es jurado de la edición y no cuenta (le faltan 2);
      // N8-B tiene uno (le faltan 2) y N8-C ninguno (le faltan 3): N8 suma 7.
      const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
        where: { status: 'CONFIRMADO' },
      });
      const teamJurors: Record<string, string[]> = {
        'N8-A': [enrolledId, jurorId],
        'N8-B': [enrolledId],
        'N8-C': [],
        'N7-A': [],
        'N0-A': [],
      };
      for (const [code, jurorIds] of Object.entries(teamJurors)) {
        const owner = userId(`owner-${code}`);
        owners.push(owner);
        await createUser(owner, 'Estudiante');
        const team = await prisma.team.create({
          data: {
            teamName: `it-ark217a-${runId}-${code}`,
            userId: owner,
            editionId,
            teamCode: `${code}${runId.slice(-6)}`.slice(0, 12),
            videogame: {
              create: {
                name: `it-ark217a-${code}-${runId}`.slice(0, 30),
                videogameStatusId: confirmed.id,
              },
            },
            assignedJurors: { connect: jurorIds.map((id) => ({ id })) },
          },
        });
        teams[code] = team.id;
      }

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
      const ids = [...fixtures, ...owners];
      const teamIds = Object.values(teams);
      // Los equipos de cada aviso se borran en cascada con el aviso.
      await prisma.substituteNotice.deleteMany({
        where: { jurorId: { in: ids } },
      });
      await prisma.jurorAssignmentAuditLog.deleteMany({
        where: { teamId: { in: teamIds } },
      });
      await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
      await prisma.jurorEdition.deleteMany({ where: { jurorId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
    });

    it('solo el Administrador: Staff 403 en la propuesta y en la asignación', async () => {
      await server()
        .get(`/walk-in-jurors/${substituteId}/team-suggestion`)
        .set(as(staffId))
        .expect(403);
      expect((await assign({ teamIds: [teams['N8-A']] }, staffId)).status).toBe(
        403,
      );
    });

    it('a quien no es Suplente Junior de la edición responde 404', async () => {
      const res = await server()
        .get(`/walk-in-jurors/${enrolledId}/team-suggestion`)
        .set(as(adminId));
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_A_JUNIOR_SUBSTITUTE');
    });

    it('propone por faltantes, resume N8 sin colegios y respeta el tope', async () => {
      const res = await suggestion(10);
      expect(res.status).toBe(200);
      expect(res.body.levels).toEqual(
        expect.arrayContaining([
          { level: 8, faltantes: 7, gruposConFaltantes: 3 },
          { level: 7, faltantes: 3, gruposConFaltantes: 1 },
        ]),
      );
      expect(
        (res.body.levels as { level: number }[]).some((l) => l.level === 0),
      ).toBe(false);
      const needs = (res.body.teams as { faltantes: number }[]).map(
        (t) => t.faltantes,
      );
      expect(needs).toEqual([...needs].sort((a, b) => b - a));

      expect((await suggestion(1)).body.teams).toHaveLength(1);
      expect((await suggestion()).body.maxTeams).toBe(3);
      const tooMany = await server()
        .get(`/walk-in-jurors/${substituteId}/team-suggestion`)
        .query({ maxTeams: 11 })
        .set(as(adminId));
      expect(tooMany.status).toBe(400);
    });

    it('un colegio (N0) para un junior: 400 SCHOOL_REQUIRES_SENIOR y no asigna nada', async () => {
      const res = await assign({ teamIds: [teams['N0-A']] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SCHOOL_REQUIRES_SENIOR');
      expect(await jurorsOf('N0-A')).toEqual([]);
    });

    it('asigna sumando: los jurados del grupo se quedan; deja bitácora y aviso de HU-22', async () => {
      const res = await assign({ teamIds: [teams['N8-C'], teams['N8-A']] });

      expect(res.status).toBe(200);
      expect(
        (res.body.equiposAgregados as { id: number }[]).map((t) => t.id),
      ).toEqual([teams['N8-C'], teams['N8-A']]);
      expect(await jurorsOf('N8-A')).toEqual(
        [enrolledId, jurorId, substituteId].sort(),
      );
      expect(await jurorsOf('N8-C')).toEqual([substituteId]);

      const audit = await prisma.jurorAssignmentAuditLog.findMany({
        where: { jurorId: substituteId, teamId: { in: Object.values(teams) } },
      });
      expect(audit).toHaveLength(2);
      expect(audit[0]).toMatchObject({
        action: 'ASSIGN',
        actorUserId: adminId,
        notes: 'Suplente con asignación automática de grupos (HU-24).',
      });
      const notices = await prisma.substituteNotice.findMany({
        where: { jurorId: substituteId },
        include: { teams: true },
      });
      expect(notices).toHaveLength(1);
      expect(notices[0].teams.map((t) => t.teamId).sort()).toEqual(
        [teams['N8-A'], teams['N8-C']].sort(),
      );
    });

    it('ya no propone los grupos que el suplente tiene', async () => {
      const res = await suggestion(10);
      const ids = (res.body.teams as { id: number }[]).map((t) => t.id);

      expect(ids).not.toContain(teams['N8-A']);
      expect(ids).not.toContain(teams['N8-C']);
      expect(res.body.levels).toEqual(
        expect.arrayContaining([
          { level: 8, faltantes: 2, gruposConFaltantes: 1 },
        ]),
      );
    });

    it('un grupo de otro nivel pide confirmar (409); confirmado, se guarda y omite los que ya tiene', async () => {
      const body = { teamIds: [teams['N7-A'], teams['N8-A']] };
      const first = await assign(body);
      expect(first.status).toBe(409);
      expect(
        (first.body.warnings as { code: string }[]).map((w) => w.code),
      ).toContain('JUROR_MIXED_LEVELS');
      expect(await jurorsOf('N7-A')).toEqual([]);

      const second = await assign({ ...body, confirmWarnings: true });
      expect(second.status).toBe(200);
      expect(
        (second.body.equiposAgregados as { id: number }[]).map((t) => t.id),
      ).toEqual([teams['N7-A']]);
      expect(
        (second.body.equiposYaAsignados as { id: number }[]).map((t) => t.id),
      ).toEqual([teams['N8-A']]);
    });

    it('un grupo que no existe responde 404 TEAM_NOT_FOUND', async () => {
      const res = await assign({ teamIds: [999999999] });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('TEAM_NOT_FOUND');
    });
  },
);
