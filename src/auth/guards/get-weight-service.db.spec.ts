import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RolePermissionGuard } from './role-permission.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

/**
 * Prueba de integración (ARK-SP1 #9): el servicio RBAC `GetWeight` debe existir en una BD
 * migrada, de modo que GET /settings/weights no devuelva 404 "Required service configuration".
 * Usa el RolePermissionGuard real contra la BD de DATABASE_URL; solo corre con
 * RUN_DB_TESTS=1 (necesita una BD con las migraciones y el seed aplicados).
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Servicio RBAC GetWeight (BD real)', () => {
  const prisma = new PrismaService();
  const cache = {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  } as unknown as CacheService;
  const reflector = {
    get: () => 'GetWeight',
  } as unknown as Reflector;
  const guard = new RolePermissionGuard(
    reflector,
    prisma,
    cache,
    new ConfigService({}),
  );
  const ctx = (roleId: number) =>
    ({
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 1, roleId } }),
      }),
    }) as unknown as ExecutionContext;
  const roleId = async (name: string) =>
    (await prisma.role.findFirstOrThrow({ where: { name } })).id;

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('GetWeight existe, está activo y tiene un permiso asociado', async () => {
    const svc = await prisma.service.findUnique({
      where: { name: 'GetWeight' },
      include: { servicePermissions: true },
    });
    expect(svc?.isActive).toBe(true);
    expect(svc!.servicePermissions.length).toBeGreaterThan(0);
  });

  it('Profesor ya no recibe 404 por configuración faltante', async () => {
    const result: unknown = await guard
      .canActivate(ctx(await roleId('Profesor')))
      .catch((e: unknown) => e);
    expect(result).not.toBeInstanceOf(NotFoundException);
    // El seed no concede READ_WEIGHT a ningún rol: se espera 403 (o true si se concede después).
    expect(result === true || result instanceof ForbiddenException).toBe(true);
  });

  it('Administrador pasa el guard', async () => {
    await expect(
      guard.canActivate(ctx(await roleId('Administrador'))),
    ).resolves.toBe(true);
  });
});
