import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';

type UserRow = {
  id: string;
  email: string;
  password: string | null;
  authMethod: 'PASSWORD' | 'ENTRA_ID' | null;
  microsoftOid: string | null;
  isActive: boolean;
};

type RefreshRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

const PASSWORD = 'Pass1234';
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/**
 * In-memory stand-in for the parts of PrismaService the session flow uses.
 * It honours the `where` filters the service sends, so revocations are observable.
 */
function createFakePrisma(users: UserRow[]) {
  const refreshTokens: RefreshRow[] = [];
  let seq = 0;

  const matchesEmail = (user: UserRow, filter: any) => {
    if (typeof filter === 'string') return user.email === filter;
    if (filter?.mode === 'insensitive') {
      return user.email.toLowerCase() === String(filter.equals).toLowerCase();
    }
    return user.email === filter?.equals;
  };

  const matchesRefresh = (row: RefreshRow, where: any) =>
    (where.id === undefined || row.id === where.id) &&
    (where.tokenHash === undefined || row.tokenHash === where.tokenHash) &&
    (where.userId === undefined || row.userId === where.userId) &&
    (where.revokedAt !== null || row.revokedAt === null) &&
    (where.expiresAt?.lt === undefined || row.expiresAt < where.expiresAt.lt);

  const prisma: any = {
    refreshTokens,
    user: {
      findUnique: jest.fn(
        async ({ where }) =>
          users.find((u) =>
            where.id !== undefined
              ? u.id === where.id
              : u.email === where.email,
          ) ?? null,
      ),
      findFirst: jest.fn(
        async ({ where }) =>
          users.find((u) => matchesEmail(u, where.email)) ?? null,
      ),
      update: jest.fn(async ({ where, data }) => {
        const user = users.find((u) => u.id === where.id)!;
        Object.assign(user, data);
        return user;
      }),
      create: jest.fn(async ({ data }) => {
        const user = { ...data } as UserRow;
        users.push(user);
        return user;
      }),
    },
    verificationToken: {
      create: jest.fn(async ({ data }) => data),
    },
    refreshToken: {
      create: jest.fn(async ({ data }) => {
        if (refreshTokens.some((r) => r.tokenHash === data.tokenHash)) {
          throw new Error('Unique constraint failed on token_hash');
        }
        const row: RefreshRow = {
          id: `rt-${++seq}`,
          revokedAt: null,
          createdAt: new Date(),
          ...data,
        };
        refreshTokens.push(row);
        return row;
      }),
      findUnique: jest.fn(
        async ({ where }) =>
          refreshTokens.find((r) => r.tokenHash === where.tokenHash) ?? null,
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = refreshTokens.filter((r) => matchesRefresh(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const rows = refreshTokens.filter((r) => matchesRefresh(r, where));
        rows.forEach((r) => refreshTokens.splice(refreshTokens.indexOf(r), 1));
        return { count: rows.length };
      }),
    },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
      fn(prisma),
    ),
  };
  return prisma;
}

function createResponse() {
  const cookies: Record<string, { value: string; options: any }> = {};
  const cleared: Array<{ name: string; options: any }> = [];
  const res: any = {
    cookies,
    cleared,
    cookie: jest.fn((name: string, value: string, options: any) => {
      cookies[name] = { value, options };
    }),
    clearCookie: jest.fn((name: string, options: any) => {
      cleared.push({ name, options });
    }),
    redirect: jest.fn(),
  };
  return res;
}

const requestWith = (refreshToken?: string): any => ({
  cookies: refreshToken ? { 'refresh-token': refreshToken } : {},
});

describe('AuthService: sesión revocable', () => {
  let users: UserRow[];
  let prisma: any;
  let service: AuthService;

  beforeEach(() => {
    users = [
      {
        id: 'user-1',
        email: 'estudiante@uninorte.edu.co',
        password: bcrypt.hashSync(PASSWORD, 4),
        authMethod: 'PASSWORD',
        microsoftOid: null,
        isActive: true,
      },
      {
        // Usuario anterior al cambio: su correo quedó guardado con mayúsculas
        id: 'user-legacy',
        email: 'Juan.Perez@Uninorte.edu.co',
        password: bcrypt.hashSync(PASSWORD, 4),
        authMethod: 'PASSWORD',
        microsoftOid: null,
        isActive: true,
      },
    ];
    prisma = createFakePrisma(users);
    const config: any = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    };
    const jwt = new JwtService({ secret: 'test-secret' });
    service = new AuthService(
      prisma,
      config,
      {} as any,
      jwt,
      {} as any,
      { resendAuthEmailOfType: jest.fn() } as any,
    );
  });

  async function login(email = 'estudiante@uninorte.edu.co') {
    const res = createResponse();
    const body = await service.login(
      { email, password: PASSWORD },
      'PASSWORD',
      res,
    );
    return {
      body,
      res,
      refreshToken: res.cookies['refresh-token'].value as string,
    };
  }

  async function refresh(refreshToken: string) {
    const res = createResponse();
    const body = await service.refresh(requestWith(refreshToken), res);
    return {
      body,
      res,
      refreshToken: res.cookies['refresh-token'].value as string,
    };
  }

  it('login guarda solo el sha256 del refresh emitido, con su vencimiento', async () => {
    const { refreshToken } = await login();

    expect(prisma.refreshTokens).toHaveLength(1);
    const [row] = prisma.refreshTokens;
    expect(row.userId).toBe('user-1');
    expect(row.tokenHash).toBe(sha256(refreshToken));
    expect(row.tokenHash).not.toBe(refreshToken);
    expect(row.revokedAt).toBeNull();
    const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(row.expiresAt.getTime() - expectedExpiry)).toBeLessThan(
      5000,
    );
  });

  it('el refresh anterior deja de servir tras rotar (401)', async () => {
    const first = await login();
    const second = await refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(
      service.refresh(requestWith(first.refreshToken), createResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotar en el mismo segundo del login no repite el token (jti)', async () => {
    const first = await login();
    const second = await refresh(first.refreshToken);
    const third = await refresh(second.refreshToken);

    expect(
      new Set([first, second, third].map((s) => s.refreshToken)).size,
    ).toBe(3);
    const active = prisma.refreshTokens.filter((r: RefreshRow) => !r.revokedAt);
    expect(active).toHaveLength(1);
    expect(active[0].tokenHash).toBe(sha256(third.refreshToken));
  });

  it('tras logout el refresh deja de servir (401)', async () => {
    const { refreshToken } = await login();
    const res = createResponse();

    await service.logout(requestWith(refreshToken), res);

    expect(res.cleared.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(['access-token', 'refresh-token']),
    );
    await expect(
      service.refresh(requestWith(refreshToken), createResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout sin cookie de refresh no falla', async () => {
    await expect(
      service.logout(requestWith(), createResponse()),
    ).resolves.toEqual({
      message: 'Logout successful',
    });
  });

  it('reusar un refresh ya rotado revoca todos los refresh del usuario', async () => {
    const laptop = await login();
    const phone = await login();
    const rotated = await refresh(laptop.refreshToken);

    await expect(
      service.refresh(requestWith(laptop.refreshToken), createResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(
      prisma.refreshTokens.filter(
        (r: RefreshRow) => r.userId === 'user-1' && !r.revokedAt,
      ),
    ).toHaveLength(0);
    await expect(
      service.refresh(requestWith(rotated.refreshToken), createResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.refresh(requestWith(phone.refreshToken), createResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('un refresh válido sin registro (sesión anterior al despliegue) da 401 y borra las cookies', async () => {
    const jwt = new JwtService({ secret: 'test-secret' });
    const legacy = jwt.sign(
      { sub: 'user-1', email: 'estudiante@uninorte.edu.co', type: 'refresh' },
      { expiresIn: 3600 },
    );
    const res = createResponse();

    await expect(
      service.refresh(requestWith(legacy), res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.cleared.map((c: { name: string }) => c.name)).toContain(
      'refresh-token',
    );
  });

  it('el cuerpo de login y refresh no incluye access ni refresh', async () => {
    const { body: loginBody, refreshToken } = await login();
    const { body: refreshBody } = await refresh(refreshToken);

    expect(loginBody).not.toHaveProperty('access');
    expect(loginBody).not.toHaveProperty('refresh');
    expect(refreshBody).not.toHaveProperty('access');
    expect(refreshBody).not.toHaveProperty('refresh');
    // Lo único que el front lee de /auth/refresh
    expect(typeof refreshBody.accessToken).toBe('string');
    expect(refreshBody.accessTokenExpiresIn).toBe(900);
  });

  it('la cookie de refresh también llega a /auth/logout', async () => {
    const { res } = await login();
    expect(res.cookies['refresh-token'].options.path).toBe('/auth');
    // La cookie vieja (Path=/auth/refresh) se borra para que no tape a la nueva
    expect(res.cleared).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'refresh-token',
          options: expect.objectContaining({ path: '/auth/refresh' }),
        }),
      ]),
    );
  });

  it('login borra los refresh vencidos del usuario', async () => {
    prisma.refreshTokens.push({
      id: 'old',
      userId: 'user-1',
      tokenHash: 'expired-hash',
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      createdAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
    });

    await login();

    expect(
      prisma.refreshTokens.find((r: RefreshRow) => r.id === 'old'),
    ).toBeUndefined();
    expect(prisma.refreshTokens).toHaveLength(1);
  });

  it('login con el correo en otra capitalización funciona', async () => {
    const lowerStored = await login('Estudiante@UNINORTE.edu.co');
    expect(lowerStored.body.message).toBe('Login successful');

    // Usuario existente con mayúsculas en la BD
    const legacy = await login('juan.perez@uninorte.edu.co');
    expect(prisma.refreshTokens.at(-1).userId).toBe('user-legacy');
    expect(legacy.body.message).toBe('Login successful');
  });

  it('crear usuario guarda el correo en minúsculas', async () => {
    const { user } = await service.registerUserTransaction(
      { email: '  Nuevo.Lider@Uninorte.EDU.co ' },
      prisma,
    );

    expect(user.email).toBe('nuevo.lider@uninorte.edu.co');
    expect(prisma.verificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'nuevo.lider@uninorte.edu.co' }),
      }),
    );
  });

  it('crear usuario con un correo que ya existe en otra capitalización da conflicto', async () => {
    await expect(
      service.registerUserTransaction(
        { email: 'JUAN.PEREZ@uninorte.edu.co' },
        prisma,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
