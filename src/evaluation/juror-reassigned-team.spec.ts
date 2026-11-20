// In-memory Prisma fake: its methods are async on purpose to mirror the real client.
/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { CacheService } from '../cache/cache.service';
import { CriterionService } from '../criterion/criterion.service';
import { JurorAssignmentAuditService } from 'src/jurors/juror/assignment-audit/juror-assignment-audit.service';
import { JurorAssignmentService } from 'src/jurors/juror/assignment-audit/juror-assignment.service';
import { PendingGamesController } from 'src/pending-games/pending-games.controller';
import { PendingGamesService } from 'src/pending-games/pending-games.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamVerificationController } from '../team-verification/team-verification.controller';
import { TeamVerificationService } from '../team-verification/team-verification.service';
import { BlobReferenceService } from '../upload/blob-reference.service';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';

/**
 * ARK-190 (BG-41): reproduce el caso del profesor Daniel por HTTP, con la cadena real de guards
 * (JwtAuthGuard + JwtStrategy + RolePermissionGuard) y los servicios reales sobre una BD en
 * memoria: reasignar un equipo y calificarlo con el jurado que lo perdió y con el que lo recibió.
 * Fija el contrato de ARK-191: perder el equipo es 403 o una fila fallida, nunca 401, y no toca
 * las cookies de la sesión.
 */
const SECRET = 'test-secret';
const TEAM_ID = 1;
const GAME_ID = 10;
const CODE = 'K7M2QX';
const ROLE = { admin: 1, professor: 2, juror: 3, student: 4 };
const NOT_ASSIGNED = 'Este grupo no está asignado al evaluador';

function createDb() {
  const users = ['juror-a', 'juror-b', 'student', 'admin'].map((id) => ({
    id,
    email: `${id}@test.co`,
    firstName: id,
    lastName: 'T',
    isActive: true,
    roleId:
      id === 'student'
        ? ROLE.student
        : id === 'admin'
          ? ROLE.admin
          : ROLE.juror,
    jurorCategory: 'JUNIOR',
  }));
  const jurors = new Set(['juror-a']);
  const verified = new Set<string>();
  const evaluations: any[] = [];
  const receipts = new Map<string, any>();
  const team = {
    id: TEAM_ID,
    teamCode: 'N1-001',
    teamName: 'Equipo',
    editionId: 5,
    isActive: true,
    verificationCode: CODE,
    edition: { status: 'ACTIVE', title: 'Feria' },
  };
  const game = {
    id: GAME_ID,
    name: 'Juego',
    isActive: true,
    videogameStatus: { status: 'CONFIRMADO' },
    logoUrl: null,
    description: 'd',
  };
  const assignedTo = (where?: { id?: string }) =>
    [...jurors]
      .filter((id) => !where?.id || where.id === id)
      .map((id) => ({
        id,
        roleId: ROLE.juror,
        firstName: id,
        lastName: 'T',
        email: `${id}@test.co`,
        jurorCategory: 'JUNIOR',
      }));
  const isPendingFor = (jurorId: string) =>
    jurors.has(jurorId) &&
    !evaluations.some(
      (e) => e.jurorId === jurorId && e.videogameId === GAME_ID,
    );
  const pendingJuror = (where: any): string =>
    where.AND[0].NOT.evaluations.some.jurorId;

  const prisma: any = {
    user: {
      findUnique: jest.fn(
        async ({ where }) => users.find((u) => u.id === where.id) ?? null,
      ),
      findFirst: jest.fn(async () => ({ id: 'participa' })),
    },
    role: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.name === 'Profesor') return { id: ROLE.professor };
        return { name: where.id === ROLE.admin ? 'Administrador' : 'Otro' };
      }),
      findFirst: jest.fn(async ({ where }) => ({
        id: where.name === 'Jurado' ? ROLE.juror : ROLE.professor,
      })),
    },
    service: { findUnique: jest.fn(async () => ({ id: 'svc' })) },
    servicePermission: {
      findMany: jest.fn(async () => [{ permissionId: 7 }]),
    },
    rolePermission: {
      findMany: jest.fn(async ({ where }) =>
        where.roleId === ROLE.juror ? [{ permissionId: 7 }] : [],
      ),
    },
    edition: {
      findFirst: jest.fn(async () => ({
        id: 5,
        title: 'Feria',
        status: 'ACTIVE',
      })),
    },
    eventConfiguration: {
      findFirst: jest.fn(async () => ({ evaluationsOpen: true })),
    },
    criterion: { findMany: jest.fn(async () => [{ id: 1, weight: 1 }]) },
    videogame: {
      findMany: jest.fn(async ({ where, select }) => {
        if (where.AND) {
          if (!isPendingFor(pendingJuror(where))) return [];
          return [{ ...game, team: { ...team, members: [] } }];
        }
        const teamSelect = select.team.select;
        const verifierId = teamSelect.verifications?.where.jurorId;
        return [
          {
            ...game,
            team: {
              ...team,
              members: [],
              assignedJurors: teamSelect.assignedJurors
                ? assignedTo(teamSelect.assignedJurors.where)
                : undefined,
              verifications:
                verifierId && verified.has(verifierId) ? [{ id: 1 }] : [],
            },
          },
        ];
      }),
      count: jest.fn(async ({ where }) =>
        isPendingFor(pendingJuror(where)) ? 1 : 0,
      ),
    },
    team: {
      findUnique: jest.fn(async () => ({
        ...team,
        videogame: game,
        assignedJurors: assignedTo(),
      })),
      findFirst: jest.fn(async ({ select }) => ({
        ...team,
        assignedJurors: assignedTo(select.assignedJurors.where),
      })),
      update: jest.fn(async ({ data }) => {
        const { connect, disconnect } = data.assignedJurors;
        if (disconnect) jurors.delete(disconnect.id);
        if (connect) jurors.add(connect.id);
      }),
    },
    teamVerification: {
      findUnique: jest.fn(async ({ where }) =>
        verified.has(where.teamId_jurorId.jurorId) ? { id: 1 } : null,
      ),
      create: jest.fn(async ({ data }) => verified.add(data.jurorId)),
    },
    teamVerificationLog: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => undefined),
    },
    evaluation: {
      create: jest.fn(async ({ data }) => {
        const row = { id: evaluations.length + 1, ...data };
        evaluations.push(row);
        return { id: row.id };
      }),
      findMany: jest.fn(async ({ where }) =>
        evaluations.filter((e) => e.jurorId === where.jurorId),
      ),
      findUnique: jest.fn(async () => null),
    },
    evaluationDraft: { updateMany: jest.fn(async () => ({ count: 0 })) },
    evaluationIdempotency: {
      findUnique: jest.fn(
        async ({ where }) =>
          receipts.get(
            `${where.jurorId_key.jurorId}:${where.jurorId_key.key}`,
          ) ?? null,
      ),
      create: jest.fn(async ({ data }) =>
        receipts.set(`${data.jurorId}:${data.key}`, data),
      ),
    },
    jurorAssignmentAuditLog: { create: jest.fn(async () => ({ id: 1 })) },
    $executeRaw: jest.fn(async () => 0),
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
      fn(prisma),
    ),
  };
  return { prisma, evaluations, verified };
}

describe('Jurado y equipo reasignado por HTTP (ARK-190)', () => {
  let app: INestApplication;
  let db: ReturnType<typeof createDb>;
  let assignments: JurorAssignmentService;
  const jwt = new JwtService({ secret: SECRET });

  const as = (sub: string) => ({
    Cookie: `access-token=${jwt.sign(
      { sub, email: `${sub}@test.co`, type: 'access' },
      { expiresIn: 900 },
    )}`,
  });

  const evaluation = {
    videogameId: GAME_ID,
    comments: 'Lo que el jurado escribió',
    details: [
      {
        criterionId: 1,
        score: 4,
        createdAt: '2026-11-26T10:00:00.000Z',
        updatedAt: '2026-11-26T10:00:00.000Z',
        isActive: true,
      },
    ],
  };
  const submit = (sub: string, key = `key-${sub}`) =>
    request(app.getHttpServer())
      .post('/evaluation/with-details')
      .set(as(sub))
      .set('Idempotency-Key', key)
      .send(evaluation);
  const submitBatch = (sub: string) =>
    request(app.getHttpServer())
      .post('/evaluation/batch')
      .set(as(sub))
      .send({ evaluations: [evaluation] });
  const pending = (sub: string) =>
    request(app.getHttpServer())
      .get('/pending-games?limit=10&page=1')
      .set(as(sub));
  const verify = (sub: string) =>
    request(app.getHttpServer())
      .post('/team-verification/verify')
      .set(as(sub))
      .send({ teamId: TEAM_ID, code: CODE });
  const reassign = (from: string, to: string) =>
    assignments.reassign(from, to, TEAM_ID, 'admin', true);

  const expectSessionUntouched = (res: request.Response) =>
    expect(res.headers['set-cookie']).toBeUndefined();

  beforeEach(async () => {
    Logger.overrideLogger(false);
    db = createDb();
    const store = new Map<string, unknown>();
    const cache = {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: unknown) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    };
    const config = {
      get: (key: string, fallback?: unknown) =>
        key === 'JWT_SECRET' ? SECRET : fallback,
    };
    const auth = new AuthService(
      db.prisma,
      config as any,
      cache as any,
      jwt,
      {} as any,
      {} as any,
    );

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [
        EvaluationController,
        PendingGamesController,
        TeamVerificationController,
      ],
      providers: [
        EvaluationService,
        PendingGamesService,
        TeamVerificationService,
        RolePermissionGuard,
        { provide: PrismaService, useValue: db.prisma },
        { provide: CacheService, useValue: cache },
        { provide: ConfigService, useValue: config },
        { provide: BlobReferenceService, useValue: blobRefsPassthrough() },
        {
          provide: CriterionService,
          useValue: { findForSelect: async () => [{ id: 1, weight: 1 }] },
        },
        {
          provide: JwtStrategy,
          useFactory: () => new JwtStrategy(config as any, auth),
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

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

    assignments = new JurorAssignmentService(
      db.prisma,
      new JurorAssignmentAuditService(db.prisma),
      { validate: async () => ({}), enforce: () => [] } as any,
      {
        notifyAssignmentChanged: () => undefined,
        notifyTeamsAssigned: () => undefined,
      } as any,
      // HU-22 (ARK-84): avisos a suplentes (no aplican en estas pruebas).
      { recordAssignment: async () => null, sendEmailAfterCommit: () => undefined } as any,
    );
    await assignments.onModuleInit();
    db.verified.add('juror-a');
  });

  afterEach(async () => {
    await app.close();
    Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']);
  });

  describe('el jurado que perdió el equipo', () => {
    beforeEach(() => reassign('juror-a', 'juror-b'));

    it('POST /evaluation/with-details: 403 con motivo, sin guardar y con la sesión intacta', async () => {
      const res = await submit('juror-a');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        message: NOT_ASSIGNED,
      });
      expectSessionUntouched(res);
      expect(db.evaluations).toHaveLength(0);
    });

    it('POST /evaluation/batch: 201 con la fila en failed, sin guardar y con la sesión intacta', async () => {
      const res = await submitBatch('juror-a');

      expect(res.status).toBe(201);
      expect(res.body.results).toEqual({
        successful: [],
        failed: [{ videogameId: GAME_ID, error: NOT_ASSIGNED }],
      });
      expectSessionUntouched(res);
      expect(db.evaluations).toHaveLength(0);
    });

    it('POST /team-verification/verify: 403, no 401', async () => {
      db.verified.delete('juror-a');
      const res = await verify('juror-a');

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Este grupo no está asignado al jurado');
      expectSessionUntouched(res);
    });

    it('GET /pending-games: 200 sin el equipo; el jurado sigue con sesión', async () => {
      await submit('juror-a');
      const res = await pending('juror-a');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.metadata.totalItems).toBe(0);
    });

    it('un rechazo por no asignado no guarda recibo: si le devuelven el equipo, la misma llave sirve', async () => {
      expect((await submit('juror-a', 'misma-llave')).status).toBe(403);

      await reassign('juror-b', 'juror-a');
      const res = await submit('juror-a', 'misma-llave');

      expect(res.status).toBe(201);
      expect(db.evaluations).toHaveLength(1);
      expect(db.evaluations[0].jurorId).toBe('juror-a');
    });
  });

  describe('el jurado que recibió el equipo', () => {
    beforeEach(() => reassign('juror-a', 'juror-b'));

    it('lo ve en pendientes, debe digitar el código y luego califica', async () => {
      const list = await pending('juror-b');
      expect(list.body.data[0]).toMatchObject({
        videogameId: GAME_ID,
        teamId: TEAM_ID,
      });

      const unverified = await submit('juror-b');
      expect(unverified.status).toBe(403);
      expect(unverified.body.message).toBe(
        'Debes digitar el código de verificación del grupo antes de calificarlo.',
      );

      expect((await verify('juror-b')).status).toBe(201);
      const saved = await submit('juror-b');
      expect(saved.status).toBe(201);
      expect(saved.body.evaluationId).toBe(1);
      expectSessionUntouched(saved);
    });
  });

  it('la evaluación ya guardada por el jurado anterior no se borra ni cambia de dueño al reasignar', async () => {
    expect((await submit('juror-a')).status).toBe(201);

    await reassign('juror-a', 'juror-b');

    expect(db.evaluations).toHaveLength(1);
    expect(db.evaluations[0].jurorId).toBe('juror-a');
  });

  describe('qué sí es 401 y qué no', () => {
    it('sin cookie: 401', async () => {
      const res = await request(app.getHttpServer()).get(
        '/pending-games?limit=10&page=1',
      );
      expect(res.status).toBe(401);
    });

    it('token vencido: 401', async () => {
      const expired = jwt.sign(
        { sub: 'juror-a', email: 'juror-a@test.co', type: 'access' },
        { expiresIn: -10 },
      );
      const res = await request(app.getHttpServer())
        .post('/evaluation/with-details')
        .set('Cookie', `access-token=${expired}`)
        .send(evaluation);
      expect(res.status).toBe(401);
    });

    it('rol sin permiso: 403', async () => {
      const res = await submit('student');
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'You do not have permission to access this resource.',
      );
    });

    it('evaluaciones cerradas: 403, no 401', async () => {
      db.prisma.eventConfiguration.findFirst.mockResolvedValue({
        evaluationsOpen: false,
      });
      expect((await submit('juror-a')).status).toBe(403);
      expect((await pending('juror-a')).status).toBe(403);
    });

    it('la BD falla al cargar al usuario: 503, nunca 401', async () => {
      db.prisma.user.findUnique.mockRejectedValue(
        new Error('Timed out fetching a new connection from the pool'),
      );
      const res = await submit('juror-a');

      expect(res.status).toBe(503);
      expectSessionUntouched(res);
    });
  });
});
