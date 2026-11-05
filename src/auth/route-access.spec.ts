import { ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RolePermissionGuard } from './guards/role-permission.guard';
import { REQUIRED_SERVICE_KEY } from './decorators/required-service.decorator';
import {
  ADMIN_ROLE_NAME,
  AUTHENTICATED_ONLY_ROUTES,
  RbacCatalog,
  RouteInfo,
  buildRouteInventory,
  createExecutionContext,
  createFakeCache,
  createFakePrisma,
  loadRbacCatalog,
  rolesAllowedForService,
} from './route-inventory/route-inventory';

/**
 * BG-01 — Control de acceso por rol en el backend.
 *
 * Usan el RolePermissionGuard REAL, los metadatos REALES de cada ruta montada en
 * AppModule y el catálogo RBAC (seed-data.json + migración de permisos),
 * simulando únicamente la base de datos.
 */

/** Roles NO administradores que deben recibir "sin permiso" en rutas administrativas. */
const NON_ADMIN_ROLES = ['Estudiante', 'Profesor', 'Jurado', 'Staff'];

/**
 * Qué roles NO administradores pueden ejecutar cada servicio de las rutas que
 * BG-01 protegió. `[]` = solo el Administrador. Está escrito a mano a propósito:
 * si la migración asigna un permiso de más (o de menos), esta tabla lo detecta.
 */
const EXPECTED_ACCESS: Record<string, string[]> = {
  ManageEditions: [],
  ManageEducationalFocuses: [],
  ManageTestimonials: [],
  ManageHighlightedGames: [],
  ManageHistoricals: [],
  ExportAdminReports: [],
  ManageVideogames: [],
  ManageUploads: [],
  ManageAuthTokens: [],
  ViewTeamLeaderStatus: [],
  certificates: [],
  SendEmail: [],
  RegisterTeam: [],
  ListJurors: [],
  ManageTeamVerificationCode: [],
  ManageStaffAccounts: [],
  // HU-11: la mesa de escarapelas
  JurorCheckIn: ['Staff'],
  // HU-29: la mesa de escarapelas ve quién llegó y quién falta (solo lectura)
  ViewJurorAttendance: ['Staff'],
  // HU-21: los profesores lo ven en solo lectura (P-26)
  ViewEvaluationTracking: ['Profesor'],
  // HU-25: jurados por edición, solo Administrador
  ListEditionJurors: [],
  ManageEditionJurors: [],
  // HU-26: estudiantes por edición, solo Administrador
  ListEditionStudents: [],
  // Con regla de propiedad adicional en el servicio (ver *.ownership.spec.ts)
  UpdateVideogame: ['Estudiante'],
  ViewTeamEvaluationStats: ['Estudiante', 'Profesor', 'Jurado'],
};

describe('Control de acceso de las rutas (BG-01)', () => {
  // El guard registra cada decisión con el logger de Nest; se silencia para leer los resultados.
  beforeAll(() => Logger.overrideLogger(false));

  const routes: RouteInfo[] = buildRouteInventory(AppModule);
  const catalog: RbacCatalog = loadRbacCatalog();

  const roleId = (name: string) => {
    const role = catalog.roles.find((r) => r.name === name);
    if (!role) throw new Error(`El rol "${name}" no existe en el catálogo.`);
    return role.id;
  };

  const newGuard = (cat: RbacCatalog = catalog) =>
    new RolePermissionGuard(
      new Reflector(),
      createFakePrisma(cat) as any,
      createFakeCache() as any,
      { get: (_key: string, defaultValue: unknown) => defaultValue } as any,
    );

  const attempt = async (
    guard: RolePermissionGuard,
    route: RouteInfo,
    roleName: string,
  ) => {
    try {
      await guard.canActivate(
        createExecutionContext(route, {
          id: 'user-1',
          roleId: roleId(roleName),
        }),
      );
      return 'permitido';
    } catch (error) {
      return error instanceof ForbiddenException
        ? 'sin permiso'
        : `error: ${(error as Error).message}`;
    }
  };

  const permissionRoutes = routes.filter((r) => r.access.kind === 'permission');
  const serviceOf = (r: RouteInfo) =>
    r.access.kind === 'permission' ? r.access.service : '';

  describe('Inventario de rutas', () => {
    it('descubre las rutas montadas en la aplicación', () => {
      expect(routes.length).toBeGreaterThan(100);
    });

    it('ninguna ruta queda sin decidir (pública, con permiso o autenticada con razón)', () => {
      const undecided = routes
        .filter((r) => r.access.kind === 'undecided')
        .map(
          (r) =>
            `${r.key}  (${r.controller}.${r.handler}): ${(r.access as any).problem}`,
        );

      expect(undecided).toEqual([]);
    });

    it('AUTHENTICATED_ONLY_ROUTES no contiene rutas obsoletas ni que ya exijan permiso', () => {
      const stale = Object.keys(AUTHENTICATED_ONLY_ROUTES).filter(
        (key) =>
          !routes.some(
            (r) => r.key === key && r.access.kind === 'authenticated',
          ),
      );

      expect(stale).toEqual([]);
    });
  });

  describe('Catálogo de servicios y permisos', () => {
    it('todo servicio usado por una ruta existe y tiene al menos un permiso asociado', () => {
      // Un servicio sin permisos deja pasar a CUALQUIER usuario con sesión.
      const problems = [...new Set(permissionRoutes.map(serviceOf))]
        .map((service) => ({
          service,
          allowed: rolesAllowedForService(catalog, service),
        }))
        .filter(({ allowed }) => allowed === 'UNDEFINED' || allowed === 'ALL')
        .map(({ service, allowed }) =>
          allowed === 'UNDEFINED'
            ? `${service}: no existe en el catálogo (los no administradores recibirían 404)`
            : `${service}: no tiene permisos asociados (quedaría abierto a cualquier usuario con sesión)`,
        );

      expect(problems).toEqual([]);
    });

    it('cada servicio de EXPECTED_ACCESS corresponde a al menos una ruta real', () => {
      const usedServices = new Set(permissionRoutes.map(serviceOf));
      const orphan = Object.keys(EXPECTED_ACCESS).filter(
        (service) => !usedServices.has(service),
      );

      expect(orphan).toEqual([]);
    });

    it('documenta la trampa del guard: un servicio sin permisos deja pasar a un Estudiante', async () => {
      const handler = function () {};
      class FakeController {}
      Reflect.defineMetadata(
        REQUIRED_SERVICE_KEY,
        'ServicioSinPermisos',
        handler,
      );

      const withTrap: RbacCatalog = {
        ...catalog,
        services: [
          ...catalog.services,
          { id: 999999, name: 'ServicioSinPermisos' },
        ],
      };
      const fakeRoute = {
        handlerFn: handler,
        controllerClass: FakeController,
      } as unknown as RouteInfo;

      expect(await attempt(newGuard(withTrap), fakeRoute, 'Estudiante')).toBe(
        'permitido',
      );
      expect(rolesAllowedForService(withTrap, 'ServicioSinPermisos')).toBe(
        'ALL',
      );
    });
  });

  describe('Pruebas por rol con el RolePermissionGuard real', () => {
    it('el Administrador puede ejecutar todas las rutas con permiso', async () => {
      const guard = newGuard();
      const denied: string[] = [];

      for (const route of permissionRoutes) {
        if ((await attempt(guard, route, ADMIN_ROLE_NAME)) !== 'permitido')
          denied.push(route.key);
      }

      expect(denied).toEqual([]);
    });

    // ARK-110: las dos rutas de jurados por equipo, una por una
    it.each([
      [
        'GET /juror/teams/:teamId/jurors-status',
        {
          Estudiante: 'sin permiso',
          Profesor: 'sin permiso',
          Jurado: 'sin permiso',
          Staff: 'sin permiso',
        },
      ],
      [
        'GET /juror/teams/:teamId/evaluation-stats',
        {
          Estudiante: 'permitido',
          Profesor: 'permitido',
          Jurado: 'permitido',
          Staff: 'sin permiso',
        },
      ],
    ])('%s exige permiso según el rol (ARK-110)', async (key, expected) => {
      const route = permissionRoutes.find((r) => r.key === key);
      expect(route).toBeDefined();

      const guard = newGuard();
      const results: Record<string, string> = {};
      for (const roleName of NON_ADMIN_ROLES) {
        results[roleName] = await attempt(guard, route!, roleName);
      }

      expect(results).toEqual(expected);
      expect(await attempt(guard, route!, ADMIN_ROLE_NAME)).toBe('permitido');
    });

    describe.each(NON_ADMIN_ROLES)('rol %s', (roleName) => {
      it.each(Object.entries(EXPECTED_ACCESS))(
        'servicio %s',
        async (service, allowedRoles) => {
          const guard = newGuard();
          const serviceRoutes = permissionRoutes.filter(
            (r) => serviceOf(r) === service,
          );
          const expected = allowedRoles.includes(roleName)
            ? 'permitido'
            : 'sin permiso';

          expect(serviceRoutes.length).toBeGreaterThan(0);

          const results: Record<string, string> = {};
          for (const route of serviceRoutes) {
            results[route.key] = await attempt(guard, route, roleName);
          }

          expect(results).toEqual(
            Object.fromEntries(serviceRoutes.map((r) => [r.key, expected])),
          );
        },
      );
    });
  });
});
