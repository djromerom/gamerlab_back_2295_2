import { ForbiddenException } from '@nestjs/common';
import { ROLE_IDS } from '../auth/constants/roles';
import { AppUser } from '../auth/jwt.strategy';
import { stripPersonalData } from '../common/utils/strip-personal-data';

/**
 * ARK-112: quién puede leer un equipo por `GET /teams/:id` y `GET /teams/:id/full`, y qué ve.
 *
 * - `admin`: todo.
 * - `own` (líder o integrante activo del equipo): todo, menos el correo de los jurados
 *   asignados, que solo ve el administrador.
 * - `other` (cualquier otro rol que tenga el permiso `GetTeam`): el equipo sin correos, sin
 *   códigos estudiantiles y sin el código de verificación que el jurado digita para calificar.
 *
 * Un estudiante que no pertenece al equipo recibe 403: el permiso `GetTeam` lo tiene el rol
 * Estudiante, así que el permiso por rol no basta.
 */
export type TeamAudience = 'admin' | 'own' | 'other';

export const TEAM_FORBIDDEN_MESSAGE =
  'You do not have permission to access this resource.';

export function isTeamLeaderOrMember(
  user: Pick<AppUser, 'id' | 'email'>,
  team: { userId: string },
  memberEmails: (string | null | undefined)[],
): boolean {
  if (team.userId === user.id) return true;
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;
  return memberEmails.some((m) => m?.trim().toLowerCase() === email);
}

export function resolveTeamAudience(
  user: Pick<AppUser, 'roleId'>,
  ownsTeam: boolean,
): TeamAudience {
  if (user.roleId === ROLE_IDS.ADMIN) return 'admin';
  if (ownsTeam) return 'own';
  if (user.roleId === ROLE_IDS.STUDENT) {
    throw new ForbiddenException(TEAM_FORBIDDEN_MESSAGE);
  }
  return 'other';
}

/** Copia del equipo con los campos que `audience` puede ver. No modifica el original. */
export function filterTeamForAudience<T extends object>(
  team: T,
  audience: TeamAudience,
): T {
  if (audience === 'admin') return team;

  const record = team as Record<string, unknown>;

  if (audience === 'own') {
    if (!Array.isArray(record.assignedJurors)) return team;
    return {
      ...record,
      assignedJurors: stripPersonalData(record.assignedJurors),
    } as T;
  }

  const { verificationCode: _hidden, ...rest } = stripPersonalData(record);
  return rest as T;
}
