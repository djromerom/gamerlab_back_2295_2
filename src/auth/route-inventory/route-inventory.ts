/**
 * Inventario de acceso de las rutas del backend (BG-01).
 *
 * Este módulo NO se usa en tiempo de ejecución de la API. Lo usan:
 *  - `auth/route-access.spec.ts` (pruebas automáticas por rol), y
 *  - `scripts/generate-route-inventory.ts` (genera `docs/route-access-inventory.md`).
 *
 * Lee los metadatos reales de los controladores montados en `AppModule`
 * (`@Public`, `@UseGuards(RolePermissionGuard)`, `@RequiredService`), de modo que
 * el inventario no puede desincronizarse del código.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { RequestMethod } from '@nestjs/common';
import { REQUIRED_SERVICE_KEY } from '../decorators/required-service.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RolePermissionGuard } from '../guards/role-permission.guard';

export const ADMIN_ROLE_NAME = 'Administrador';

/**
 * Rutas que, POR DISEÑO, solo exigen haber iniciado sesión (cualquier rol).
 * Toda ruta que no sea pública ni exija permiso debe estar aquí con su razón;
 * si no, la prueba `route-access.spec.ts` falla. Así ninguna ruta queda sin decidir.
 */
export const AUTHENTICATED_ONLY_ROUTES: Record<string, string> = {
  'PATCH /settings/registrations':
    'Solo el Administrador (AdminRoleGuard): abre o cierra las inscripciones.',
  'GET /videogames/:id/my-like':
    'Cualquier usuario con sesión puede consultar si ya dio like a un juego.',
  'POST /videogames/:id/toggle-like':
    'Cualquier usuario con sesión puede dar o quitar su propio like.',
  'GET /reports/JuradosData':
    'La usa la página "Mis jurados": el administrador ve todos los jurados y cualquier otro usuario solo los de su propio equipo (OptionalAdminRoleGuard, BG-02).',
  'GET /ranking':
    'Solo el Administrador (AdminRoleGuard): ranking oficial por nivel con empates (HU-04).',
  'GET /ranking/winners':
    'Solo el Administrador (AdminRoleGuard): ganadores de cada nivel (HU-04).',
  'GET /ranking/ties':
    'Solo el Administrador (AdminRoleGuard): empates detectados (HU-04).',
  'GET /ranking/decisions':
    'Solo el Administrador (AdminRoleGuard): decisiones de desempate registradas (HU-04).',
  'POST /ranking/finalize':
    'Solo el Administrador (AdminRoleGuard): define el ranking final (HU-04).',
  'GET /students':
    'Solo el Administrador (AdminRoleGuard): evaluaciones individuales del equipo. El estudiante recibe 403 y ve solo la nota final (HU-30, ARK-154).',
  'GET /final-grade/release':
    'Solo el Administrador (AdminRoleGuard): estado de la liberación de la nota final y equipos con datos incompletos (HU-20, ARK-80).',
  'PATCH /final-grade/release':
    'Solo el Administrador (AdminRoleGuard): libera (desde las 12:00 del día de la feria) u oculta la nota final a los estudiantes (HU-20, ARK-80).',
};

/**
 * Notas que se imprimen en el inventario (`docs/route-access-inventory.md`).
 * No afectan el comportamiento: documentan reglas de propiedad que el permiso por
 * rol no puede expresar y rutas que conviene revisar en otras tareas.
 */
export const ROUTE_NOTES: Record<string, string> = {
  'PATCH /teams/:id':
    'Estudiante: solo si es líder del equipo (TeamsService.update).',
  'PATCH /teams/:teamId/members/:memberId':
    'Estudiante: solo si es líder del equipo (TeamsService.updateMemberEmail).',
  'POST /teams/:id/member': 'Estudiante: solo su propio equipo (BG-01).',
  'DELETE /teams/:id/members/:memberId':
    'Estudiante: solo su propio equipo, y el integrante debe pertenecer a ese equipo (BG-01).',
  'PATCH /videogames/:id':
    'Estudiante: solo el videojuego de su equipo; el estado de aprobación solo lo cambia el Administrador (BG-01).',
  'GET /juror/teams/:teamId/evaluation-stats':
    'Estudiante: solo las estadísticas de su propio equipo (BG-01). Solo devuelve conteos, sin datos de los jurados (ARK-110).',
  'GET /juror/teams/:teamId/jurors-status':
    'Solo Administrador (ListJurors no está concedido a ningún otro rol). El correo de cada jurado solo se incluye para el Administrador (ARK-110).',
  'GET /teams/:id':
    'Estudiante: solo su propio equipo (líder o integrante activo). Otros roles con GetTeam lo reciben sin correos, códigos estudiantiles ni código de verificación (ARK-112).',
  'GET /teams/:id/full':
    'Estudiante: solo su propio equipo (líder o integrante activo), sin el correo de los jurados. Otros roles con GetTeam lo reciben sin correos, códigos estudiantiles ni código de verificación (ARK-112).',
  'GET /final-grade/me':
    'Estudiante: solo la nota final de su propio equipo en la edición activa, sin desglose, y solo cuando el administrador la liberó (HU-20, ARK-80).',
  'GET /students/grades':
    'Estudiante: la nota final de su equipo o null si no está liberada o está en proceso (HU-20, ARK-80). Reemplazada por GET /final-grade/me.',
  'POST /upload':
    'Pública: la usa el registro de equipos antes de crear la cuenta. Con límite de peticiones y verificación del tipo de archivo (BG-02).',
  'POST /upload/zip':
    'Pública con condición: exige sesión o token reCAPTCHA válido (cabecera x-recaptcha-token). Máx. 100 MB, 3 por 10 min y verificación del tipo de archivo (I6).',
  'GET /reports/videojuegoData':
    '⚠️ BG-02: pública; revisar si debe exigir sesión o rol.',
  'GET /reports/materiaData':
    '⚠️ BG-02: pública; revisar si debe exigir sesión o rol.',
  'GET /reports/NRCData':
    '⚠️ BG-02: pública; revisar si debe exigir sesión o rol.',
  'GET /reports/JuradosData':
    'Antes era pública; desde ARK-60 exige sesión y filtra los jurados según el rol.',
  'POST /ranking/ties/decision':
    'Profesor: solo empates entre grupos de sus NRC (RankingService.decide); el Administrador, cualquier empate pendiente (HU-04).',
  'GET /ranking/my-ties':
    'Profesor: solo los empates que le toca decidir (HU-04).',
  'GET /reports/DatosGraficoMateria':
    '⚠️ BG-02: pública; revisar si debe exigir sesión o rol.',
};

export type RouteAccess =
  | { kind: 'public' }
  | { kind: 'permission'; service: string }
  | { kind: 'authenticated'; reason: string }
  | { kind: 'undecided'; problem: string };

export interface RouteInfo {
  controller: string;
  handler: string;
  method: string;
  path: string;
  /** `${method} ${path}` */
  key: string;
  access: RouteAccess;
  controllerClass: Function;
  handlerFn: Function;
}

function resolveModule(item: any): any {
  if (
    item &&
    typeof item === 'object' &&
    typeof item.forwardRef === 'function'
  ) {
    return item.forwardRef();
  }
  return item;
}

/** Recorre los imports de AppModule y devuelve los controladores realmente montados. */
export function collectMountedControllers(rootModule: any): Function[] {
  const seenModules = new Set<any>();
  const controllers = new Set<Function>();

  const visit = (raw: any) => {
    const item = resolveModule(raw);
    const cls =
      item && typeof item === 'object' && item.module ? item.module : item;
    if (!cls || typeof cls !== 'function' || seenModules.has(cls)) return;
    seenModules.add(cls);

    const staticControllers: Function[] =
      Reflect.getMetadata('controllers', cls) ?? [];
    const dynamicControllers: Function[] =
      item && typeof item === 'object' && Array.isArray(item.controllers)
        ? item.controllers
        : [];
    [...staticControllers, ...dynamicControllers].forEach((c) =>
      controllers.add(c),
    );

    const staticImports: any[] = Reflect.getMetadata('imports', cls) ?? [];
    const dynamicImports: any[] =
      item && typeof item === 'object' && Array.isArray(item.imports)
        ? item.imports
        : [];
    [...staticImports, ...dynamicImports].forEach(visit);
  };

  visit(rootModule);
  return Array.from(controllers);
}

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [''] : Array.isArray(v) ? v : [v];

const joinPath = (...parts: string[]): string => {
  const joined = parts
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter((p) => p.length > 0)
    .join('/');
  return '/' + joined;
};

function classifyAccess(
  key: string,
  isPublic: boolean | undefined,
  usesRoleGuard: boolean,
  service: string | undefined,
): RouteAccess {
  if (isPublic) return { kind: 'public' };

  if (usesRoleGuard) {
    return service
      ? { kind: 'permission', service }
      : {
          kind: 'undecided',
          problem:
            'Usa RolePermissionGuard pero no tiene @RequiredService (respondería 500).',
        };
  }

  const reason = AUTHENTICATED_ONLY_ROUTES[key];
  if (reason) return { kind: 'authenticated', reason };

  return {
    kind: 'undecided',
    problem:
      'Solo exige sesión y no está en AUTHENTICATED_ONLY_ROUTES: decide si es pública, con permiso o autenticada.',
  };
}

export function buildRouteInventory(rootModule: any): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const controller of collectMountedControllers(rootModule)) {
    const basePaths = asArray(Reflect.getMetadata('path', controller));
    const classGuards: Function[] =
      Reflect.getMetadata('__guards__', controller) ?? [];
    const proto = controller.prototype;

    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const fn = proto[name];
      if (typeof fn !== 'function') continue;

      const methodId: number | undefined = Reflect.getMetadata('method', fn);
      if (methodId === undefined) continue;

      const subPaths = asArray(Reflect.getMetadata('path', fn));
      const handlerGuards: Function[] =
        Reflect.getMetadata('__guards__', fn) ?? [];
      const usesRoleGuard = [...classGuards, ...handlerGuards].includes(
        RolePermissionGuard,
      );

      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, fn) ??
        Reflect.getMetadata(IS_PUBLIC_KEY, controller);
      const service: string | undefined =
        Reflect.getMetadata(REQUIRED_SERVICE_KEY, fn) ??
        Reflect.getMetadata(REQUIRED_SERVICE_KEY, controller);

      const method = RequestMethod[methodId];

      for (const base of basePaths) {
        for (const sub of subPaths) {
          const fullPath = joinPath(base, sub);
          const key = `${method} ${fullPath}`;
          routes.push({
            controller: controller.name,
            handler: name,
            method,
            path: fullPath,
            key,
            access: classifyAccess(key, isPublic, usesRoleGuard, service),
            controllerClass: controller,
            handlerFn: fn,
          });
        }
      }
    }
  }

  return routes.sort((a, b) =>
    a.controller === b.controller
      ? a.key.localeCompare(b.key)
      : a.controller.localeCompare(b.controller),
  );
}

/* ------------------------------------------------------------------ */
/* Catálogo RBAC (servicios -> permisos -> roles)                       */
/* ------------------------------------------------------------------ */

export interface RbacCatalog {
  roles: { id: number; name: string }[];
  permissions: { id: number; name: string }[];
  services: { id: number; name: string }[];
  servicePermissions: { serviceId: number; permissionId: number }[];
  rolePermissions: { roleId: number; permissionId: number }[];
}

const PROJECT_ROOT = path.resolve(__dirname, '../../../');

const isActive = (row: { isActive?: boolean }) => row.isActive !== false;

/** Extrae pares ('a', 'b') del bloque VALUES que sigue a `startMarker` en la migración. */
function parsePairs(sql: string, startMarker: string): [string, string][] {
  const start = sql.indexOf(startMarker);
  if (start < 0)
    throw new Error(
      `No se encontró "${startMarker}" en la migración de permisos.`,
    );
  const end = sql.indexOf(') AS v(', start);
  const block = sql.slice(start, end);
  return [...block.matchAll(/\('((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)/g)].map(
    (m) => [m[1].replace(/''/g, "'"), m[2].replace(/''/g, "'")],
  );
}

/**
 * Carga el catálogo tal como quedaría en una base con el seed
 * (`prisma/seed-data.json`) MÁS la migración `*_add_admin_route_permissions`.
 */
export function loadRbacCatalog(
  projectRoot: string = PROJECT_ROOT,
): RbacCatalog {
  const seed: { table: string; data: any[] }[] = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'prisma/seed-data.json'), 'utf8'),
  );
  const table = (name: string): any[] =>
    (seed.find((t) => t.table === name)?.data ?? []).filter(isActive);

  const catalog: RbacCatalog = {
    roles: table('roles').map((r) => ({ id: r.id, name: r.name })),
    permissions: table('permisos').map((p) => ({ id: p.id, name: p.name })),
    services: table('servicio').map((s) => ({ id: s.id, name: s.name })),
    servicePermissions: table('servicio_permiso').map((x) => ({
      serviceId: x.serviceId,
      permissionId: x.permissionId,
    })),
    rolePermissions: table('rol_permiso').map((x) => ({
      roleId: x.roleId,
      permissionId: x.permissionId,
    })),
  };

  const migrationsDir = path.join(projectRoot, 'prisma/migrations');
  const migrationDir = fs
    .readdirSync(migrationsDir)
    .filter((d) => d.endsWith('_add_admin_route_permissions'))
    .sort()[0];
  if (!migrationDir)
    throw new Error(
      'No se encontró la migración *_add_admin_route_permissions.',
    );

  const sql = fs.readFileSync(
    path.join(migrationsDir, migrationDir, 'migration.sql'),
    'utf8',
  );

  // Los ids reales se asignan al migrar; aquí se usan ids sintéticos (todo se resuelve por nombre).
  let nextId = 100000;
  const permissionId = (name: string) =>
    catalog.permissions.find((p) => p.name === name)?.id;
  const serviceId = (name: string) =>
    catalog.services.find((s) => s.name === name)?.id;
  const roleId = (name: string) =>
    catalog.roles.find((r) => r.name === name)?.id;

  for (const [name] of parsePairs(sql, 'INSERT INTO "permisos"')) {
    if (permissionId(name) === undefined)
      catalog.permissions.push({ id: nextId++, name });
  }
  for (const [name] of parsePairs(sql, 'INSERT INTO "servicio" (')) {
    if (serviceId(name) === undefined)
      catalog.services.push({ id: nextId++, name });
  }
  for (const [service, permission] of parsePairs(
    sql,
    'INSERT INTO "servicio_permiso"',
  )) {
    const s = serviceId(service);
    const p = permissionId(permission);
    if (s === undefined || p === undefined)
      throw new Error(`Migración: ${service}/${permission} no resuelve.`);
    if (
      !catalog.servicePermissions.some(
        (x) => x.serviceId === s && x.permissionId === p,
      )
    ) {
      catalog.servicePermissions.push({ serviceId: s, permissionId: p });
    }
  }
  for (const [role, permission] of parsePairs(
    sql,
    'INSERT INTO "rol_permiso"',
  )) {
    const r = roleId(role);
    const p = permissionId(permission);
    if (r === undefined || p === undefined)
      throw new Error(`Migración: ${role}/${permission} no resuelve.`);
    if (
      !catalog.rolePermissions.some(
        (x) => x.roleId === r && x.permissionId === p,
      )
    ) {
      catalog.rolePermissions.push({ roleId: r, permissionId: p });
    }
  }

  return catalog;
}

/** Roles que pueden ejecutar un servicio según el catálogo (el Administrador siempre). */
export function rolesAllowedForService(
  catalog: RbacCatalog,
  serviceName: string,
): string[] | 'ALL' | 'UNDEFINED' {
  const service = catalog.services.find((s) => s.name === serviceName);
  if (!service) return 'UNDEFINED';

  const permissionIds = catalog.servicePermissions
    .filter((sp) => sp.serviceId === service.id)
    .map((sp) => sp.permissionId);
  // El guard deja pasar a cualquier usuario con sesión si el servicio no tiene permisos.
  if (permissionIds.length === 0) return 'ALL';

  const roles = new Set<string>([ADMIN_ROLE_NAME]);
  for (const rp of catalog.rolePermissions) {
    if (permissionIds.includes(rp.permissionId)) {
      const role = catalog.roles.find((r) => r.id === rp.roleId);
      if (role) roles.add(role.name);
    }
  }
  return Array.from(roles).sort();
}

/* ------------------------------------------------------------------ */
/* Dobles de prueba para ejercitar el RolePermissionGuard REAL          */
/* ------------------------------------------------------------------ */

/** Imita las consultas Prisma que hace el RolePermissionGuard. */
export function createFakePrisma(catalog: RbacCatalog) {
  return {
    role: {
      findUnique: async ({ where }: { where: { id: number } }) => {
        const role = catalog.roles.find((r) => r.id === where.id);
        return role ? { name: role.name } : null;
      },
    },
    service: {
      findUnique: async ({ where }: { where: { name: string } }) => {
        const service = catalog.services.find((s) => s.name === where.name);
        return service ? { id: service.id } : null;
      },
    },
    servicePermission: {
      findMany: async ({ where }: { where: { serviceId: number } }) =>
        catalog.servicePermissions
          .filter((sp) => sp.serviceId === where.serviceId)
          .map((sp) => ({ permissionId: sp.permissionId })),
    },
    rolePermission: {
      findMany: async ({ where }: { where: { roleId: number } }) =>
        catalog.rolePermissions
          .filter((rp) => rp.roleId === where.roleId)
          .map((rp) => ({ permissionId: rp.permissionId })),
    },
  };
}

export function createFakeCache() {
  const store = new Map<string, any>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: any) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };
}

/** ExecutionContext mínimo para que el guard lea los metadatos reales de la ruta. */
export function createExecutionContext(
  route: RouteInfo,
  user: { id: string; roleId: number },
) {
  return {
    getHandler: () => route.handlerFn,
    getClass: () => route.controllerClass,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}
