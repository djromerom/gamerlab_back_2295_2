import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { EditionStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * ARK-262 (BG-62): historial de cambios manuales de asignación por HTTP contra PostgreSQL real,
 * con la aplicación completa (guards, permisos del seed y ValidationPipe):
 * - se pueden recorrer todos los registros por páginas, sin repetidos ni saltos, aunque varios
 *   tengan la misma fecha (asignación automática);
 * - cada registro trae los nombres (nunca solo el id) y la nota con los códigos traducidos;
 * - `limit` admite como máximo 100.
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con migraciones y seed.
 * Crea sus datos y los borra al final.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

process.env.JWT_SECRET ??= 'e2e-jwt-secret';
process.env.RECAPTCHA_SECRET_KEY ??= 'e2e-recaptcha-secret';
process.env.AZURE_TENANT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_ID ??= '00000000-0000-0000-0000-000000000000';
process.env.AZURE_CLIENT_SECRET ??= 'e2e-entra-secret';
process.env.REDIRECT_URI ??= 'http://localhost:3000/auth/microsoft/callback';

interface AuditRow {
  id: number;
  action: string;
  actorUserId: string;
  actorName: string | null;
  jurorName: string | null;
  previousJurorName: string | null;
  newJurorName: string | null;
  teamName: string | null;
  teamCode: string | null;
  gameName: string | null;
  notes: string | null;
  notesText: string | null;
}
interface AuditPage {
  data: AuditRow[];
  metadata: {
    totalItems: number;
    itemsOnCurrentPage: number;
    currentPage: number;
    itemsPerPage: number;
    totalPages: number;
  };
}

describeIfDb(
  'Historial de cambios manuales (ARK-262, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const id = (name: string) => `it-ark262-${runId}-${name}`;
    const [adminId, otherAdminId, jurorId, studentId] = [
      'admin',
      'otro-admin',
      'jurado',
      'estudiante',
    ].map(id);
    const allUsers = [adminId, otherAdminId, jurorId, studentId];
    const TOTAL = 45;

    let app: INestApplication;
    let teamId: number;

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const audit = (query: string, sub = adminId) =>
      request(app.getHttpServer() as never)
        .get(`/juror/assignments/audit?teamId=${teamId}&${query}`)
        .set(as(sub));

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      const edition = await prisma.edition.findFirstOrThrow({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
      });
      const roleOf = async (name: string) =>
        (await prisma.role.findUniqueOrThrow({ where: { name } })).id;
      const users: [string, string, string, string][] = [
        [adminId, 'Administrador', 'Admin', 'Principal'],
        [otherAdminId, 'Administrador', 'Otro', 'Administrador'],
        [jurorId, 'Jurado', 'Ana', 'Gómez'],
        [studentId, 'Estudiante', 'IT', 'Estudiante'],
      ];
      for (const [userId, roleName, firstName, lastName] of users) {
        await prisma.user.create({
          data: {
            id: userId,
            email: `${userId}@uninorte.edu.co`,
            roleId: await roleOf(roleName),
            firstName,
            lastName,
          },
        });
      }
      const pending = await prisma.videogameStatus.findUniqueOrThrow({
        where: { status: 'PENDIENTE' },
      });
      const team = await prisma.team.create({
        data: {
          teamName: `it-ark262-${runId}`,
          userId: studentId,
          editionId: edition.id,
          teamCode: `N1-A-${runId.slice(-5)}`,
          videogame: {
            create: {
              name: `it-ark262-${runId}`.slice(0, 30),
              videogameStatusId: pending.id,
            },
          },
        },
      });
      teamId = team.id;

      // 45 registros con la MISMA fecha (como una asignación automática): sin desempate por id, las
      // páginas podían repetir o saltarse registros.
      const sameInstant = new Date('2026-11-18T10:00:00.000Z');
      await prisma.jurorAssignmentAuditLog.createMany({
        data: Array.from({ length: TOTAL }, (_, index) => ({
          action: 'ASSIGN' as const,
          actorUserId: index % 3 === 0 ? otherAdminId : adminId,
          teamId,
          jurorId: index === 4 ? id('no-existe') : jurorId,
          newJurorId: index === 4 ? id('no-existe') : jurorId,
          notes:
            index === 7
              ? 'Desasignación manual desde módulo admin. Advertencias aceptadas: TEAM_UNDER_MIN.'
              : 'Asignación manual desde módulo admin.',
          createdAt: sameInstant,
        })),
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
      await prisma.jurorAssignmentAuditLog.deleteMany({ where: { teamId } });
      await prisma.team.deleteMany({ where: { id: teamId } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: allUsers } },
      });
      await prisma.user.deleteMany({ where: { id: { in: allUsers } } });
      await prisma.$disconnect();
    });

    it('se recorren los 45 registros por páginas, sin repetidos ni saltos', async () => {
      const seen: number[] = [];
      for (const page of [1, 2, 3]) {
        const res = await audit(`page=${page}&limit=20`).expect(200);
        const body = res.body as AuditPage;
        expect(body.metadata).toMatchObject({
          totalItems: TOTAL,
          currentPage: page,
          itemsPerPage: 20,
          totalPages: 3,
        });
        seen.push(...body.data.map((row) => row.id));
      }
      expect(seen).toHaveLength(TOTAL);
      expect(new Set(seen).size).toBe(TOTAL);
      // Misma fecha: de lo más nuevo a lo más viejo por id
      expect(seen).toEqual([...seen].sort((a, b) => b - a));
    });

    it('cada registro trae los nombres, aunque el administrador no esté en la lista de jurados', async () => {
      const res = await audit('page=1&limit=100').expect(200);
      const rows = (res.body as AuditPage).data;
      expect(rows).toHaveLength(TOTAL);
      for (const row of rows) {
        expect(row.actorName).toBe(
          row.actorUserId === otherAdminId
            ? 'Otro Administrador'
            : 'Admin Principal',
        );
        expect(row.teamName).toBe(`it-ark262-${runId}`);
        expect(row.teamCode).toBe(`N1-A-${runId.slice(-5)}`);
        expect(row.gameName).toBe(`it-ark262-${runId}`.slice(0, 30));
      }
      const withJuror = rows.filter((row) => row.jurorName !== null);
      expect(withJuror).toHaveLength(TOTAL - 1);
      expect(withJuror.every((row) => row.jurorName === 'Ana Gómez')).toBe(
        true,
      );
      // Un jurado que ya no existe da null: el front muestra «no disponible», no el id
      const missing = rows.filter((row) => row.jurorName === null);
      expect(missing).toHaveLength(1);
      expect(missing[0].newJurorName).toBeNull();
    });

    it('la nota trae el texto de la advertencia, no el código', async () => {
      const res = await audit('page=1&limit=100').expect(200);
      const rows = (res.body as AuditPage).data;
      const warned = rows.filter((row) =>
        row.notes?.includes('TEAM_UNDER_MIN'),
      );
      expect(warned).toHaveLength(1);
      // Lo guardado no cambia; solo la nota traducida
      expect(warned[0].notesText).toBe(
        'Desasignación manual desde módulo admin. Advertencias aceptadas: El grupo quedaría con menos de 3 jurados.',
      );
      expect(
        rows.some((row) => row.notesText?.includes('TEAM_UNDER_MIN')),
      ).toBe(false);
    });

    it('limit admite como máximo 100', async () => {
      await audit('page=1&limit=100').expect(200);
      const res = await audit('page=1&limit=101').expect(400);
      expect(JSON.stringify(res.body)).toContain(
        'limit no puede ser mayor a 100',
      );
    });

    it('un estudiante no ve el historial (403)', async () => {
      await audit('page=1&limit=20', studentId).expect(403);
    });
  },
);
