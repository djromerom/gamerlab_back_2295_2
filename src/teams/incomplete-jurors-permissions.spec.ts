import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SERVICE_KEY } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_IDS } from '../auth/constants/roles';
import { TeamsController } from './controllers/teams.controller';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const seed: {
  table: string;
  data: any[];
}[] = require('../../prisma/seed-data.json');

// ARK-SP1 #2: GET /teams/incomplete-jurors expone datos de jurados; solo el Administrador.
// eslint-disable-next-line @typescript-eslint/unbound-method -- solo se leen metadatos
const handler = TeamsController.prototype.getTeamsWithIncompleteJurors;
const table = (name: string) => seed.find((t) => t.table === name)!.data;

describe('Permisos de GET /teams/incomplete-jurors (ARK-SP1 #2)', () => {
  const serviceName: string = Reflect.getMetadata(
    REQUIRED_SERVICE_KEY,
    handler,
  );

  const prisma = {
    role: {
      findUnique: ({ where }: any) =>
        Promise.resolve({
          name: table('roles').find((r) => r.id === where.id).name,
        }),
    },
    service: {
      findUnique: ({ where }: any) =>
        Promise.resolve(
          table('servicio').find((s) => s.name === where.name) ?? null,
        ),
    },
    servicePermission: {
      findMany: ({ where }: any) =>
        Promise.resolve(
          table('servicio_permiso').filter(
            (sp) => sp.serviceId === where.serviceId,
          ),
        ),
    },
    rolePermission: {
      findMany: ({ where }: any) =>
        Promise.resolve(
          table('rol_permiso').filter((rp) => rp.roleId === where.roleId),
        ),
    },
  };
  const cache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    delete: jest.fn(),
  };
  const config = { get: jest.fn((_k: string, fb?: unknown) => fb) };
  const guard = new RolePermissionGuard(
    new Reflector(),
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    config as unknown as ConfigService,
  );
  const ctx = (roleId: number) =>
    ({
      getHandler: () => handler,
      getClass: () => TeamsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u', roleId } }),
      }),
    }) as unknown as ExecutionContext;

  it('usa un servicio exclusivo del administrador', () => {
    expect(serviceName).toBe('AssignJurors');
  });

  it.each([
    ['Estudiante', ROLE_IDS.STUDENT],
    ['Profesor', ROLE_IDS.PROFESSOR],
    ['Jurado', ROLE_IDS.JUROR],
  ])('%s => 403', async (_n, roleId) => {
    await expect(guard.canActivate(ctx(roleId))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('Administrador => pasa', async () => {
    await expect(guard.canActivate(ctx(ROLE_IDS.ADMIN))).resolves.toBe(true);
  });
});
