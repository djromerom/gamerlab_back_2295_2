import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SERVICE_KEY } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { CacheService } from 'src/cache/cache.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProfessorsController } from './professors.controller';

// HU-02: GET /professors/download-grading-report-grouped exige ExportToExcel
// eslint-disable-next-line @typescript-eslint/unbound-method -- solo se leen metadatos
const handler = ProfessorsController.prototype.downloadGradingReportGrouped;

const ROLES = { admin: 1, profesor: 2, jurado: 3 };
const EXPORT_TO_EXCEL_PERMISSION = 40;

describe('Permisos de la exportación filtrada (HU-02)', () => {
  it('el endpoint declara RolePermissionGuard y ExportToExcel', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      RolePermissionGuard,
    );
    expect(Reflect.getMetadata(REQUIRED_SERVICE_KEY, handler)).toBe(
      'ExportToExcel',
    );
  });

  describe('RolePermissionGuard sobre el endpoint', () => {
    const prisma = {
      role: { findUnique: jest.fn() },
      service: { findUnique: jest.fn() },
      servicePermission: { findMany: jest.fn() },
      rolePermission: { findMany: jest.fn() },
    };
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      delete: jest.fn(),
    };
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    };

    let guard: RolePermissionGuard;

    const contextFor = (user: unknown) =>
      ({
        getHandler: () => handler,
        getClass: () => ProfessorsController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;

    beforeEach(() => {
      jest.clearAllMocks();
      cache.get.mockResolvedValue(null);
      prisma.role.findUnique.mockImplementation(
        ({ where }: { where: { id: number } }) =>
          Promise.resolve({
            name:
              where.id === ROLES.admin
                ? 'Administrador'
                : where.id === ROLES.profesor
                  ? 'Profesor'
                  : 'Jurado',
          }),
      );
      prisma.service.findUnique.mockResolvedValue({ id: 'svc-export' });
      prisma.servicePermission.findMany.mockResolvedValue([
        { permissionId: EXPORT_TO_EXCEL_PERMISSION },
      ]);
      prisma.rolePermission.findMany.mockImplementation(
        ({ where }: { where: { roleId: number } }) =>
          Promise.resolve(
            where.roleId === ROLES.profesor
              ? [{ permissionId: EXPORT_TO_EXCEL_PERMISSION }]
              : [{ permissionId: 99 }],
          ),
      );

      guard = new RolePermissionGuard(
        new Reflector(),
        prisma as unknown as PrismaService,
        cache as unknown as CacheService,
        config as unknown as ConfigService,
      );
    });

    it('consulta el servicio ExportToExcel', async () => {
      await guard.canActivate(contextFor({ id: 'p', roleId: ROLES.profesor }));
      expect(prisma.service.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: 'ExportToExcel', isActive: true },
        }),
      );
    });

    it('Profesor con el permiso ⇒ pasa', async () => {
      await expect(
        guard.canActivate(contextFor({ id: 'p', roleId: ROLES.profesor })),
      ).resolves.toBe(true);
    });

    it('Jurado sin el permiso ⇒ 403', async () => {
      await expect(
        guard.canActivate(contextFor({ id: 'j', roleId: ROLES.jurado })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('Administrador ⇒ pasa sin consultar permisos', async () => {
      await expect(
        guard.canActivate(contextFor({ id: 'a', roleId: ROLES.admin })),
      ).resolves.toBe(true);
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('sin rol en la sesión ⇒ 401', async () => {
      await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
