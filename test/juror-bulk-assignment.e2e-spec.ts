import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { EditionStatus, PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AssignmentPushNotifier } from '../src/push-notifications/assignment-push-notifier.service';
import { AzureStorageService } from '../src/upload/azure-storage.service';

/**
 * HU-42 (ARK-275): POST /juror/assignments/bulk por HTTP contra PostgreSQL real, con la aplicación
 * completa (guards, permisos del seed, ValidationPipe y reglas de HU-08):
 * - asigna en lote y responde por equipo; un equipo bloqueado no frena a los demás;
 * - las advertencias se piden juntas (409) y con confirmWarnings se guardan;
 * - bitácora por equipo y UN solo aviso push;
 * - un problema del jurado frena todo; solo el Administrador;
 * - la asignación de un solo equipo sigue igual.
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

interface BulkBody {
  message: string;
  jurado: { id: string; nombre: string };
  resultados: {
    equipoId: number;
    estado: string;
    cantidadJurados: number | null;
    advertencias: { code: string }[];
    bloqueo: { code: string; message: string } | null;
  }[];
  totales: { solicitados: number; asignados: number; bloqueados: number };
  advertenciasAceptadas: { code: string }[];
}

describeIfDb(
  'Asignar varios equipos a un jurado (ARK-275, HTTP + PostgreSQL)',
  () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: url ?? 'postgresql://unused' } },
    });
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const runId = Date.now().toString(36);
    const id = (key: string) => `it-ark275-${runId}-${key}`;
    const adminId = id('admin');
    const studentId = id('estudiante');
    const jurorId = id('jurado');
    const outsiderId = id('jurado-fuera'); // jurado que no está en la edición
    const userIds: string[] = [];
    const teamIds: Record<string, number> = {};

    let app: INestApplication;
    let editionId: number;
    let pushSpy: jest.SpyInstance;

    const as = (sub: string) => ({
      Cookie: `access-token=${jwt.sign(
        { sub, email: `${sub}@uninorte.edu.co`, type: 'access' },
        { expiresIn: 900 },
      )}`,
    });
    const server = () => request(app.getHttpServer() as never);
    const bulk = (body: object, sub = adminId) =>
      server().post('/juror/assignments/bulk').set(as(sub)).send(body);

    const createUser = async (
      userId: string,
      roleName: string,
      extra: { jurorCategory?: 'JUNIOR' | 'SENIOR' } = {},
    ) => {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
      });
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@uninorte.edu.co`,
          roleId: role.id,
          firstName: 'IT',
          lastName: userId.slice(-8),
          ...extra,
        },
      });
      userIds.push(userId);
    };

    /** Equipo de la edición activa con un líder propio y el juego en el estado dado. */
    const createTeam = async (
      key: string,
      level: 'N0' | 'N1',
      status = 'CONFIRMADO',
      jurors: string[] = [],
    ) => {
      const leader = id(`lider-${key}`);
      await createUser(leader, 'Estudiante');
      const videogameStatus = await prisma.videogameStatus.findUniqueOrThrow({
        where: { status },
      });
      const team = await prisma.team.create({
        data: {
          teamName: `it-ark275-${key}-${runId}`,
          userId: leader,
          editionId,
          teamCode: `${level}-${key}${runId.slice(-6)}`, // máximo 12 caracteres
          videogame: {
            create: {
              name: `it-275-${key}-${runId}`.slice(0, 30),
              videogameStatusId: videogameStatus.id,
            },
          },
          assignedJurors: {
            connect: jurors.map((jurorUserId) => ({ id: jurorUserId })),
          },
        },
      });
      teamIds[key] = team.id;
    };

    const assignedTo = async (key: string) =>
      (
        await prisma.team.findUniqueOrThrow({
          where: { id: teamIds[key] },
          select: { assignedJurors: { select: { id: true } } },
        })
      ).assignedJurors.map((juror) => juror.id);
    const auditRows = (key: string) =>
      prisma.jurorAssignmentAuditLog.findMany({
        where: { teamId: teamIds[key], jurorId },
        select: { action: true, actorUserId: true, notes: true },
      });

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      const edition = await prisma.edition.findFirstOrThrow({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
      });
      editionId = edition.id;

      await createUser(adminId, 'Administrador');
      await createUser(studentId, 'Estudiante');
      await createUser(jurorId, 'Jurado', { jurorCategory: 'JUNIOR' });
      await createUser(outsiderId, 'Jurado', { jurorCategory: 'JUNIOR' });
      // El jurado participa en la edición activa (HU-25): Confirmado y Oficial.
      await prisma.jurorEdition.create({
        data: { jurorId, editionId, status: 'CONFIRMED', type: 'OFFICIAL' },
      });

      await createTeam('a', 'N1'); // normal, confirmado
      await createTeam('b', 'N1'); // normal, confirmado
      await createTeam('p', 'N1', 'PENDIENTE'); // sin confirmar
      await createTeam('s', 'N0'); // colegio: un junior no puede
      await createTeam('d', 'N1', 'CONFIRMADO', [jurorId]); // el jurado ya está asignado
      await createTeam('x', 'N1'); // para advertencias
      await createTeam('y', 'N1'); // para advertencias
      await createTeam('z', 'N1'); // para la asignación de un solo equipo

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
      pushSpy = jest.spyOn(
        AssignmentPushNotifier.prototype,
        'notifyAssignmentChanged',
      );
    });

    afterAll(async () => {
      pushSpy?.mockRestore();
      await app?.close();
      const ids = Object.values(teamIds);
      await prisma.jurorAssignmentAuditLog.deleteMany({
        where: { OR: [{ teamId: { in: ids } }, { actorUserId: adminId }] },
      });
      await prisma.team.deleteMany({ where: { id: { in: ids } } });
      await prisma.jurorEdition.deleteMany({ where: { jurorId } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    });

    it('solo el Administrador puede asignar en lote', async () => {
      await bulk({ jurorId, teamIds: [1] }, studentId).expect(403);
      await server()
        .post('/juror/assignments/bulk')
        .send({ jurorId, teamIds: [1] })
        .expect(401);
    });

    it.each([
      ['sin equipos', { jurorId, teamIds: [] }],
      ['equipos repetidos', { jurorId, teamIds: [1, 1] }],
      ['un id que no es número', { jurorId, teamIds: ['abc'] }],
      ['sin jurado', { teamIds: [1] }],
      [
        'más de 50 equipos',
        { jurorId, teamIds: Array.from({ length: 51 }, (_, i) => i + 1) },
      ],
    ])('datos inválidos (%s) → 400', async (_label, body) => {
      await bulk(body).expect(400);
    });

    it('un jurado que no participa en la edición activa frena todo con 400', async () => {
      const res = await bulk({
        jurorId: outsiderId,
        teamIds: [teamIds.a],
      }).expect(400);
      expect(res.body).toMatchObject({ code: 'EVALUATOR_NOT_IN_EDITION' });
      expect(await assignedTo('a')).toEqual([]);
    });

    it('un jurado que no existe → 404', async () => {
      await bulk({ jurorId: id('no-existe'), teamIds: [teamIds.a] }).expect(
        404,
      );
    });

    it('asigna los equipos válidos y responde por equipo; los bloqueados no frenan a los demás', async () => {
      pushSpy.mockClear();
      const ghost = 2_000_000_000;

      const res = await bulk({
        jurorId,
        teamIds: [teamIds.a, teamIds.b, teamIds.p, teamIds.s, teamIds.d, ghost],
      }).expect(200);
      const body = res.body as BulkBody;

      expect(
        body.resultados.map((r) => [r.equipoId, r.estado, r.bloqueo?.code]),
      ).toEqual([
        [teamIds.a, 'ASSIGNED', undefined],
        [teamIds.b, 'ASSIGNED', undefined],
        [teamIds.p, 'BLOCKED', 'TEAM_NOT_CONFIRMED'],
        [teamIds.s, 'BLOCKED', 'SCHOOL_REQUIRES_SENIOR'],
        [teamIds.d, 'BLOCKED', 'DUPLICATE_ASSIGNMENT'],
        [ghost, 'BLOCKED', 'TEAM_NOT_FOUND'],
      ]);
      expect(body.totales).toEqual({
        solicitados: 6,
        asignados: 2,
        bloqueados: 4,
      });
      expect(body.advertenciasAceptadas).toEqual([]);

      // Guardado: solo los dos válidos.
      expect(await assignedTo('a')).toContain(jurorId);
      expect(await assignedTo('b')).toContain(jurorId);
      expect(await assignedTo('p')).not.toContain(jurorId);
      expect(await assignedTo('s')).not.toContain(jurorId);

      // Bitácora: una fila ASSIGN por equipo asignado y ninguna para los bloqueados.
      expect(await auditRows('a')).toEqual([
        {
          action: 'ASSIGN',
          actorUserId: adminId,
          notes: 'Asignación manual en lote desde módulo admin.',
        },
      ]);
      expect(await auditRows('b')).toHaveLength(1);
      expect(await auditRows('p')).toHaveLength(0);
      expect(await auditRows('s')).toHaveLength(0);

      // UN solo aviso push al jurado, no uno por equipo.
      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledWith([jurorId]);
    });

    it('si todos los equipos quedan bloqueados responde 200 con todos BLOCKED y no guarda ni avisa', async () => {
      pushSpy.mockClear();
      const before = await prisma.jurorAssignmentAuditLog.count({
        where: { actorUserId: adminId },
      });

      const res = await bulk({
        jurorId,
        teamIds: [teamIds.p, teamIds.s],
      }).expect(200);
      const body = res.body as BulkBody;

      expect(body.totales).toEqual({
        solicitados: 2,
        asignados: 0,
        bloqueados: 2,
      });
      expect(body.resultados.every((r) => r.estado === 'BLOCKED')).toBe(true);
      expect(
        await prisma.jurorAssignmentAuditLog.count({
          where: { actorUserId: adminId },
        }),
      ).toBe(before);
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('las advertencias se piden juntas (409) sin guardar nada, y con confirmWarnings se guardan', async () => {
      // El jurado ya tiene a, b y d: con x e y quedaría con 5 grupos (máximo recomendado: 3).
      pushSpy.mockClear();
      const pending = { jurorId, teamIds: [teamIds.x, teamIds.y, teamIds.p] };

      const conflict = await bulk(pending).expect(409);
      expect(conflict.body).toMatchObject({
        statusCode: 409,
        code: 'ASSIGNMENT_WARNINGS',
        warnings: [expect.objectContaining({ code: 'JUROR_OVER_LIMIT' })],
        blocked: [
          expect.objectContaining({
            teamId: teamIds.p,
            code: 'TEAM_NOT_CONFIRMED',
          }),
        ],
      });
      // «Cancelar»: no se asignó nada ni se avisó.
      expect(await assignedTo('x')).toEqual([]);
      expect(await auditRows('x')).toHaveLength(0);
      expect(pushSpy).not.toHaveBeenCalled();

      // «Continuar».
      const res = await bulk({ ...pending, confirmWarnings: true }).expect(200);
      const body = res.body as BulkBody;
      expect(body.resultados.map((r) => r.estado)).toEqual([
        'ASSIGNED_WITH_WARNINGS',
        'ASSIGNED_WITH_WARNINGS',
        'BLOCKED',
      ]);
      expect(body.resultados[0].advertencias[0].code).toBe('JUROR_OVER_LIMIT');
      expect(await assignedTo('x')).toContain(jurorId);
      expect(await assignedTo('y')).toContain(jurorId);
      expect((await auditRows('x'))[0].notes).toBe(
        'Asignación manual en lote desde módulo admin. Advertencias aceptadas: JUROR_OVER_LIMIT.',
      );
      expect(pushSpy).toHaveBeenCalledTimes(1);
    });

    it('repetir la operación no duplica: los equipos ya asignados salen bloqueados por duplicado', async () => {
      const res = await bulk({
        jurorId,
        teamIds: [teamIds.a, teamIds.b],
        confirmWarnings: true,
      }).expect(200);
      expect(
        (res.body as BulkBody).resultados.map((r) => r.bloqueo?.code),
      ).toEqual(['DUPLICATE_ASSIGNMENT', 'DUPLICATE_ASSIGNMENT']);
      expect(await auditRows('a')).toHaveLength(1);
    });

    it('la asignación de un solo equipo (POST /juror/assignments) sigue funcionando igual', async () => {
      pushSpy.mockClear();
      const res = await server()
        .post('/juror/assignments')
        .set(as(adminId))
        .send({ jurorId, teamId: teamIds.z, confirmWarnings: true })
        .expect(201);
      expect(res.body).toMatchObject({
        message: 'Jurado asignado correctamente al equipo.',
        equipo: { id: teamIds.z },
      });
      expect(await assignedTo('z')).toContain(jurorId);
      expect(pushSpy).toHaveBeenCalledTimes(1);
    });
  },
);
