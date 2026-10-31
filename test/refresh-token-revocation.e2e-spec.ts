import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Integración contra PostgreSQL real de la sesión revocable (ARK-SP1, I3 e I4):
 * tabla refresh_token, rotación en transacción, reuso, logout, FK en cascada y
 * búsqueda del correo sin distinguir mayúsculas (`mode: 'insensitive'`).
 *
 * Solo corre si INTEGRATION_DATABASE_URL apunta a una base DESECHABLE con las
 * migraciones y el seed aplicados (necesita el rol "Estudiante"). Crea su propio
 * usuario y lo borra al final (sus refresh se van con él por la cascada).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeIfDb = url ? describe : describe.skip;

describeIfDb('Sesión revocable (PostgreSQL)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const config: any = { get: (_key: string, fallback?: unknown) => fallback };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    config,
    {} as any,
    new JwtService({ secret: 'it-secret' }),
    {} as any,
    {} as any,
  );
  const runId = Date.now().toString(36);
  const userId = `it-sp1-rt-${runId}`;
  // Guardado con mayúsculas, como los usuarios creados antes de normalizar el correo
  const storedEmail = `IT.Sesion.${runId}@Uninorte.edu.co`;

  const response = () => {
    const cookies: Record<string, string> = {};
    return {
      cookies,
      cookie: (name: string, value: string) => (cookies[name] = value),
      clearCookie: () => undefined,
    } as any;
  };
  const login = async (email: string) => {
    const res = response();
    await service.login({ email, password: 'Pass1234' }, 'PASSWORD', res);
    return res.cookies['refresh-token'] as string;
  };
  const refresh = async (token: string) => {
    const res = response();
    await service.refresh({ cookies: { 'refresh-token': token } } as any, res);
    return res.cookies['refresh-token'] as string;
  };
  const liveTokens = () =>
    prisma.refreshToken.count({ where: { userId, revokedAt: null } });

  beforeAll(async () => {
    Logger.overrideLogger(false);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'Estudiante' },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: storedEmail,
        roleId: role.id,
        firstName: 'IT',
        lastName: 'Sesion',
        password: await bcrypt.hash('Pass1234', 4),
        authMethod: 'PASSWORD',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
    await prisma.$disconnect();
  });

  it('login con otra capitalización, rotación, reuso y logout', async () => {
    const first = await login(storedEmail.toLowerCase());
    expect(await liveTokens()).toBe(1);

    const second = await refresh(first);
    expect(await liveTokens()).toBe(1);
    expect(
      await prisma.refreshToken.count({
        where: { userId, revokedReason: 'ROTATED' },
      }),
    ).toBe(1);

    // Reintento dentro de la ventana de gracia: sesión nueva, nada más revocado
    await refresh(first);
    expect(await liveTokens()).toBe(2);

    // Fuera de la ventana (se envejece la rotación 11 s): reuso, se revoca todo
    await prisma.refreshToken.updateMany({
      where: { userId, revokedReason: 'ROTATED' },
      data: { revokedAt: new Date(Date.now() - 11_000) },
    });
    await expect(refresh(first)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await liveTokens()).toBe(0);
    await expect(refresh(second)).rejects.toBeInstanceOf(UnauthorizedException);

    const third = await login(storedEmail.toUpperCase());
    await service.logout(
      { cookies: { 'refresh-token': third } } as any,
      response(),
    );
    expect(await liveTokens()).toBe(0);
    // Logout no tiene gracia, ni siquiera al instante
    await expect(refresh(third)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login borra los refresh vencidos del usuario', async () => {
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: `expired-${runId}`,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await login(storedEmail);

    expect(
      await prisma.refreshToken.count({
        where: { userId, expiresAt: { lt: new Date() } },
      }),
    ).toBe(0);
  });
});
