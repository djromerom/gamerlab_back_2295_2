import { ROLE_IDS } from '../auth/constants/roles';
import { AppUser } from '../auth/jwt.strategy';

/**
 * ARK-154 (HU-30): el desglose de la nota final que trae `vw_team_final_scores`.
 * - `avgJunior`: promedio de los jurados (solo las 3 primeras evaluaciones, HU-04).
 * - `avgSenior`: la nota del profesor.
 *
 * Los conteos de evaluaciones (`juniorEvaluations`, etc.) no son notas y se quedan.
 */
export const SCORE_BREAKDOWN_FIELDS = ['avgJunior', 'avgSenior'] as const;

/** Quién ve el desglose: los mismos que lo veían en su panel (Administrador, Profesor, Jurado). */
const ROLES_WITH_BREAKDOWN: ReadonlySet<number> = new Set([
  ROLE_IDS.ADMIN,
  ROLE_IDS.PROFESSOR,
  ROLE_IDS.JUROR,
]);

export function canSeeScoreBreakdown(user?: AppUser | null): boolean {
  return user?.roleId !== undefined && ROLES_WITH_BREAKDOWN.has(user.roleId);
}

/**
 * Las rutas `GET /teams/final-score/*` son públicas: el estudiante (y quien no tiene sesión)
 * recibe solo la nota final, sin el desglose, para que tampoco se lea desde la consola.
 */
export function withoutScoreBreakdown<T extends Record<string, unknown>>(
  rows: T[],
  user?: AppUser | null,
): T[] {
  if (canSeeScoreBreakdown(user)) return rows;
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const field of SCORE_BREAKDOWN_FIELDS) delete copy[field];
    return copy as T;
  });
}
