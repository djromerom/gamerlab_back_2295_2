/**
 * IDs de los roles base del sistema (ver `prisma/seed-data.json`, tabla `roles`).
 *
 * El `RolePermissionGuard` identifica al administrador por NOMBRE de rol
 * (variable `ADMIN_ROLE_NAME`). Estas constantes se usan SOLO para las reglas
 * de propiedad dentro de los servicios (p. ej. "un estudiante solo puede tocar
 * su propio equipo"), igual que ya hacía `teams.service.ts` con `roleId === 1`.
 */
export const ROLE_IDS = {
  ADMIN: 1,
  STUDENT: 2,
  PROFESSOR: 3,
  JUROR: 4,
} as const;
