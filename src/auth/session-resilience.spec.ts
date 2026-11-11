// In-memory Prisma fake: its methods are async on purpose to mirror the real client.
/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import {
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { AuthService, REFRESH_REUSE_GRACE_MS } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

/**
 * ARK-190 (BG-41): solo un token vencido o inválido cierra la sesión. El front solo expulsa ante
 * un 401/403 de /auth/refresh, así que un fallo del servidor debe ser 5xx y dejar las cookies;
 * y la respuesta perdida de un refresh no puede tomarse por robo cuando el front reintenta.
 */
const SECRET = 'test-secret';
const USER = { id: 'juror-1', email: 'jurado@uninorte.edu.co', isActive: true };
/** Espera del front antes de reintentar una renovación fallida (REFRESH_RETRY_DELAY_MS). */
const FRONT_RETRY_MS = 30_000;

type Row = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
};

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function setup() {
  const rows: Row[] = [];
  const matches = (row: Row, where: any) =>
    (where.id === undefined || row.id === where.id) &&
    (where.userId === undefined || row.userId === where.userId) &&
    (where.revokedAt !== null || row.revokedAt === null) &&
    (where.revokedReason === undefined ||
      row.revokedReason === where.revokedReason) &&
    (where.revokedAt?.gt === undefined ||
      (row.revokedAt !== null && row.revokedAt > where.revokedAt.gt));

  const prisma: any = {
    user: { findUnique: jest.fn(async () => USER) },
    refreshToken: {
      create: jest.fn(async ({ data }) => {
        rows.push({
          id: `rt-${rows.length + 1}`,
          revokedAt: null,
          revokedReason: null,
          ...data,
        });
      }),
      findUnique: jest.fn(
        async ({ where }) =>
          rows.find((r) => r.tokenHash === where.tokenHash) ?? null,
      ),
      findFirst: jest.fn(
        async ({ where }) => rows.find((r) => matches(r, where)) ?? null,
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const found = rows.filter((r) => matches(r, where));
        found.forEach((r) => Object.assign(r, data));
        return { count: found.length };
      }),
    },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
      fn(prisma),
    ),
  };

  const jwt = new JwtService({ secret: SECRET });
  const service = new AuthService(
    prisma,
    { get: (_key: string, fallback?: unknown) => fallback } as any,
    { get: jest.fn(), set: jest.fn(), delete: jest.fn() } as any,
    jwt,
    {} as any,
    {} as any,
  );

  /** Un refresh token vivo, como el que deja el login. */
  const liveToken = () => {
    const token = jwt.sign(
      { sub: USER.id, email: USER.email, type: 'refresh', jti: randomUUID() },
      { expiresIn: 3600 },
    );
    rows.push({
      id: `rt-${rows.length + 1}`,
      userId: USER.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      revokedReason: null,
    });
    return token;
  };

  return { rows, prisma, jwt, service, liveToken };
}

function createResponse() {
  const res: any = {
    cookies: {} as Record<string, string>,
    cookie: jest.fn((name: string, value: string) => {
      res.cookies[name] = value;
    }),
    clearCookie: jest.fn(),
  };
  return res;
}

const requestWith = (token: string): any => ({
  cookies: { 'refresh-token': token },
});

describe('Sesión del jurado ante fallos que no son del token (ARK-190)', () => {
  const advance = (ms: number) => jest.setSystemTime(Date.now() + ms);

  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('POST /auth/refresh', () => {
    it('si la BD falla al leer el token: 503, sin borrar cookies, y el token sigue sirviendo', async () => {
      const { service, prisma, liveToken } = setup();
      const token = liveToken();
      prisma.refreshToken.findUnique.mockRejectedValueOnce(
        new Error('Timed out fetching a new connection from the pool'),
      );
      const res = createResponse();

      await expect(
        service.refresh(requestWith(token), res),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(res.clearCookie).not.toHaveBeenCalled();

      const retry = createResponse();
      await expect(
        service.refresh(requestWith(token), retry),
      ).resolves.toMatchObject({ message: 'Session refreshed' });
      expect(retry.cookies['refresh-token']).toEqual(expect.any(String));
    });

    it('si la BD falla al rotar: 503 sin borrar cookies', async () => {
      const { service, prisma, liveToken } = setup();
      prisma.$transaction.mockRejectedValueOnce(new Error('deadlock detected'));
      const res = createResponse();

      await expect(
        service.refresh(requestWith(liveToken()), res),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('un refresh token vencido sí es 401 y borra las cookies', async () => {
      const { service, jwt } = setup();
      const expired = jwt.sign(
        { sub: USER.id, email: USER.email, type: 'refresh' },
        { expiresIn: 60 },
      );
      advance(61_000);
      const res = createResponse();

      await expect(
        service.refresh(requestWith(expired), res),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('un refresh token mal firmado sí es 401 y borra las cookies', async () => {
      const { service } = setup();
      const forged = new JwtService({ secret: 'otro-secreto' }).sign({
        sub: USER.id,
        email: USER.email,
        type: 'refresh',
      });
      const res = createResponse();

      await expect(
        service.refresh(requestWith(forged), res),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('respuesta perdida: el reintento del front a los 30 s da sesión y no revoca nada', async () => {
      const { service, rows, liveToken } = setup();
      const token = liveToken();
      // El servidor rotó, pero el navegador nunca recibió la cookie nueva (red de la feria)
      await service.refresh(requestWith(token), createResponse());

      advance(FRONT_RETRY_MS);
      const retry = createResponse();
      await expect(
        service.refresh(requestWith(token), retry),
      ).resolves.toMatchObject({ message: 'Session refreshed' });

      expect(retry.cookies['refresh-token']).toEqual(expect.any(String));
      expect(rows.some((r) => r.revokedReason === 'REUSE')).toBe(false);
    });

    it('la ventana cubre varios reintentos seguidos del front', async () => {
      const { service, rows, liveToken } = setup();
      const token = liveToken();
      await service.refresh(requestWith(token), createResponse());

      for (let attempt = 1; attempt <= 3; attempt++) {
        advance(FRONT_RETRY_MS);
        await service.refresh(requestWith(token), createResponse());
      }
      expect(rows.some((r) => r.revokedReason === 'REUSE')).toBe(false);
    });

    it('fuera de la ventana sigue siendo robo: 401 y revoca todo', async () => {
      const { service, rows, liveToken } = setup();
      const token = liveToken();
      await service.refresh(requestWith(token), createResponse());

      advance(REFRESH_REUSE_GRACE_MS + 1_000);
      await expect(
        service.refresh(requestWith(token), createResponse()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(rows.filter((r) => !r.revokedAt)).toHaveLength(0);
    });
  });

  describe('JwtStrategy.validate', () => {
    const config = { get: () => SECRET } as any;
    const payload = { sub: USER.id, email: USER.email, type: 'access' } as any;
    const strategyWith = (syncLocalUser: jest.Mock) =>
      new JwtStrategy(config, { syncLocalUser } as any);

    it('si la BD falla al cargar el usuario: 503, no 401', async () => {
      const strategy = strategyWith(
        jest.fn().mockRejectedValue(new Error('Connection terminated')),
      );

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('usuario inexistente: 401', async () => {
      const strategy = strategyWith(
        jest.fn().mockRejectedValue(new NotFoundException()),
      );

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('usuario inactivo: 401', async () => {
      const strategy = strategyWith(
        jest.fn().mockRejectedValue(new UnauthorizedException('inactive')),
      );

      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('un refresh token usado como access token: 401', async () => {
      const strategy = strategyWith(jest.fn());

      await expect(
        strategy.validate({ ...payload, type: 'refresh' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
