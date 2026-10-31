import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { getTokenExpiration } from './token-expiration';

/**
 * ARK-88 (HU-05): la vida del JWT y la de su cookie salen de la misma configuración
 * en todos los flujos que crean o renuevan sesión (login con clave, login con
 * Microsoft y /auth/refresh), y access/refresh no son intercambiables.
 */

const fakeConfig = (env: Record<string, string | undefined>) =>
  ({
    get: (key: string, def?: unknown) => (key in env ? env[key] : def),
  }) as unknown as ConfigService;

describe('getTokenExpiration', () => {
  it('usa 15 minutos y 7 días cuando las variables no existen', () => {
    expect(getTokenExpiration(fakeConfig({}))).toEqual({
      accessTokenSeconds: 15 * 60,
      refreshTokenSeconds: 7 * 24 * 60 * 60,
    });
  });

  it.each(['', 'abc', '0', '-5'])(
    'usa el default si la variable vale "%s"',
    (value) => {
      const exp = getTokenExpiration(
        fakeConfig({
          ACCESS_TOKEN_EXPIRATION_MINUTES: value,
          REFRESH_TOKEN_EXPIRATION_DAYS: value,
        }),
      );
      expect(exp).toEqual({
        accessTokenSeconds: 900,
        refreshTokenSeconds: 604800,
      });
    },
  );

  it('lee los valores del entorno (llegan como texto)', () => {
    const exp = getTokenExpiration(
      fakeConfig({
        ACCESS_TOKEN_EXPIRATION_MINUTES: '60',
        REFRESH_TOKEN_EXPIRATION_DAYS: '30',
      }),
    );
    expect(exp).toEqual({
      accessTokenSeconds: 3600,
      refreshTokenSeconds: 30 * 86400,
    });
  });
});

describe('Sesión: JWT y cookie usan la misma duración (ARK-88)', () => {
  const ENV = {
    ACCESS_TOKEN_EXPIRATION_MINUTES: '60',
    REFRESH_TOKEN_EXPIRATION_DAYS: '30',
    NODE_ENV: 'development',
    FRONTEND_URL: 'http://front.test',
  };
  const ACCESS_SECONDS = 3600;
  const REFRESH_SECONDS = 30 * 86400;

  const jwtService = new JwtService({ secret: 'test-secret' });
  let user: any;
  let prisma: any;
  let service: AuthService;

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(async () => {
    user = {
      id: 'user-1',
      email: 'senior@uninorte.edu.co',
      authMethod: 'PASSWORD',
      password: await bcrypt.hash('Pass1234', 4),
      microsoftOid: 'oid-1',
      isActive: true,
    };
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        findMany: jest.fn().mockResolvedValue([user]),
        update: jest.fn().mockResolvedValue(user),
      },
      // Every refresh presented here has a live stored record (the revocation rules are in auth.service.spec.ts)
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rt-1',
          userId: user.id,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 86400000),
        }),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(prisma));
    service = new AuthService(
      prisma,
      fakeConfig(ENV),
      {} as any,
      jwtService,
      {} as any,
      {} as any,
    );
  });

  /** Respuesta falsa de Express que guarda las cookies puestas. */
  const fakeResponse = () => {
    const cookies: Record<string, { value: string; options: any }> = {};
    const res: any = {
      cookies,
      cookie: jest.fn((name: string, value: string, options: any) => {
        cookies[name] = { value, options };
      }),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    };
    return res;
  };

  /** Comprueba que cada cookie dura exactamente lo mismo que su JWT. */
  const expectAlignedSession = (res: any) => {
    const access = jwtService.decode(res.cookies['access-token'].value);
    const refresh = jwtService.decode(res.cookies['refresh-token'].value);

    expect(access.type).toBe('access');
    expect(access.exp - access.iat).toBe(ACCESS_SECONDS);
    expect(res.cookies['access-token'].options.maxAge).toBe(
      ACCESS_SECONDS * 1000,
    );

    expect(refresh.type).toBe('refresh');
    expect(refresh.exp - refresh.iat).toBe(REFRESH_SECONDS);
    expect(res.cookies['refresh-token'].options.maxAge).toBe(
      REFRESH_SECONDS * 1000,
    );
  };

  it('login con clave', async () => {
    const res = fakeResponse();
    const body = await service.login(
      { email: user.email, password: 'Pass1234' } as any,
      'PASSWORD',
      res,
    );

    expectAlignedSession(res);
    expect(body.accessTokenExpiresIn).toBe(ACCESS_SECONDS);
  });

  it('login con Microsoft de un usuario con clave', async () => {
    jest
      .spyOn(service as any, 'exchangeCodeForToken')
      .mockResolvedValue({ id_token: 'x' });
    jest
      .spyOn(service as any, 'parseIdToken')
      .mockReturnValue({ email: user.email, oid: 'oid-1' });
    const res = fakeResponse();

    await service.handleMicrosoftCallback('code', res);

    expect(res.redirect).toHaveBeenCalledWith('http://front.test/inicio');
    expectAlignedSession(res);
  });

  it('login con Microsoft de un usuario Entra ID', async () => {
    user.authMethod = 'ENTRA_ID';
    jest
      .spyOn(service as any, 'exchangeCodeForToken')
      .mockResolvedValue({ id_token: 'x' });
    jest
      .spyOn(service as any, 'parseIdToken')
      .mockReturnValue({ email: user.email, oid: 'oid-1' });
    const res = fakeResponse();

    await service.handleMicrosoftCallback('code', res);

    expect(res.redirect).toHaveBeenCalledWith('http://front.test/inicio');
    expectAlignedSession(res);
  });

  it('refresh rota los dos tokens con la misma duración', async () => {
    // Emitido hace un minuto: si se firmara en el mismo segundo, el token nuevo sería idéntico.
    const refreshToken = jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000) - 60,
      },
      { expiresIn: REFRESH_SECONDS },
    );
    const res = fakeResponse();

    const body = await service.refresh(
      { cookies: { 'refresh-token': refreshToken } } as any,
      res,
    );

    expectAlignedSession(res);
    expect(res.cookies['refresh-token'].value).not.toBe(refreshToken);
    expect(body.accessToken).toBe(res.cookies['access-token'].value);
    expect(body.accessTokenExpiresIn).toBe(ACCESS_SECONDS);
  });

  // Un token sin registro guardado se rechaza (ver auth.service.spec.ts); aquí sí lo tiene.
  it('refresh acepta tokens sin "type" (anteriores a ARK-88) si tienen registro', async () => {
    const legacy = jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '7d' },
    );
    const res = fakeResponse();

    await service.refresh({ cookies: { 'refresh-token': legacy } } as any, res);

    expectAlignedSession(res);
  });

  it('refresh rechaza un access token', async () => {
    const accessToken = jwtService.sign(
      { sub: user.id, email: user.email, type: 'access' },
      { expiresIn: ACCESS_SECONDS },
    );
    const res = fakeResponse();

    await expect(
      service.refresh(
        { cookies: { 'refresh-token': accessToken } } as any,
        res,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('el JwtStrategy rechaza un refresh token usado como access token', async () => {
    const strategy = new JwtStrategy(
      fakeConfig({ JWT_SECRET: 'test-secret' }),
      { syncLocalUser: jest.fn().mockResolvedValue(user) } as any,
    );

    await expect(
      strategy.validate({ sub: user.id, type: 'refresh' }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      strategy.validate({ sub: user.id, type: 'access' }),
    ).resolves.toMatchObject({
      id: user.id,
    });
    await expect(strategy.validate({ sub: user.id })).resolves.toMatchObject({
      id: user.id,
    });
  });
});
