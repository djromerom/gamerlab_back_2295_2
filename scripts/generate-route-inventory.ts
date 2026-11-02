/**
 * Genera `docs/route-access-inventory.md`: inventario de TODAS las rutas montadas
 * del backend con su tipo de acceso y los roles que pueden ejecutarlas (BG-01).
 *
 * Uso:  npm run routes:inventory
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import {
  ROUTE_NOTES,
  RouteInfo,
  buildRouteInventory,
  loadRbacCatalog,
  rolesAllowedForService,
} from '../src/auth/route-inventory/route-inventory';

const catalog = loadRbacCatalog();
const routes = buildRouteInventory(AppModule);

const accessLabel = (r: RouteInfo): string => {
  switch (r.access.kind) {
    case 'public':
      return 'Pública';
    case 'authenticated':
      return 'Solo sesión';
    case 'permission':
      return `Permiso \`${r.access.service}\``;
    default:
      return '❌ Sin decidir';
  }
};

const rolesLabel = (r: RouteInfo): string => {
  switch (r.access.kind) {
    case 'public':
      return 'Cualquiera (sin sesión)';
    case 'authenticated':
      return 'Cualquier usuario con sesión';
    case 'permission': {
      const roles = rolesAllowedForService(catalog, r.access.service);
      if (roles === 'UNDEFINED')
        return '⚠️ Servicio no definido en el catálogo (solo Administrador)';
      if (roles === 'ALL')
        return '⚠️ Cualquier usuario con sesión (servicio sin permisos)';
      return roles.join(', ');
    }
    default:
      return '—';
  }
};

const noteLabel = (r: RouteInfo): string =>
  [
    r.access.kind === 'authenticated' ? r.access.reason : '',
    ROUTE_NOTES[r.key] ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\|/g, '\\|');

const count = (kind: string) =>
  routes.filter((r) => r.access.kind === kind).length;

const lines: string[] = [
  '# Inventario de acceso de las rutas del backend',
  '',
  '> Generado automáticamente con `npm run routes:inventory`. **No editar a mano**: cambia los',
  '> decoradores del controlador (o `ROUTE_NOTES` / `AUTHENTICATED_ONLY_ROUTES` en',
  '> `src/auth/route-inventory/route-inventory.ts`) y vuelve a generarlo.',
  '',
  '- **Pública**: marcada con `@Public()`; no exige sesión.',
  '- **Solo sesión**: exige haber iniciado sesión, sin distinguir rol. Cada una está justificada en',
  '  `AUTHENTICATED_ONLY_ROUTES`.',
  "- **Permiso `X`**: exige `@UseGuards(RolePermissionGuard)` + `@RequiredService('X')`. Los roles se",
  '  calculan con el catálogo (`servicio → permiso → rol`). El Administrador siempre pasa.',
  '- Las notas describen reglas de propiedad (p. ej. "solo su equipo") que se verifican en el servicio.',
  '',
  `**Total: ${routes.length} rutas** — ${count('permission')} con permiso, ${count('public')} públicas, ` +
    `${count('authenticated')} solo sesión, ${count('undecided')} sin decidir.`,
  '',
];

const byController = new Map<string, RouteInfo[]>();
for (const route of routes) {
  byController.set(route.controller, [
    ...(byController.get(route.controller) ?? []),
    route,
  ]);
}

for (const [controller, list] of byController) {
  lines.push(
    `## ${controller}`,
    '',
    '| Método | Ruta | Acceso | Roles que pueden ejecutarla | Notas |',
    '|---|---|---|---|---|',
  );
  for (const r of list) {
    lines.push(
      `| ${r.method} | \`${r.path}\` | ${accessLabel(r)} | ${rolesLabel(r)} | ${noteLabel(r)} |`,
    );
  }
  lines.push('');
}

const out = join(process.cwd(), 'docs', 'route-access-inventory.md');
mkdirSync(join(process.cwd(), 'docs'), { recursive: true });
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Inventario generado: ${out} (${routes.length} rutas)`);
