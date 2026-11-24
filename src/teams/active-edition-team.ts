import { Prisma } from '@prisma/client';
import { ACTIVE_EDITION_WHERE } from '../editions/active-edition';
import { activeMemberByEmail } from './team-membership';

/**
 * ARK-128 (BG-17): un usuario lidera a lo sumo un equipo por edición, pero puede tener equipos
 * de ediciones anteriores. "El equipo del usuario" es el de la edición activa; los de ediciones
 * pasadas no cuentan (para eso está el histórico). Úsalo con `findFirst` y
 * `orderBy: { editionId: 'desc' }` por si hubiera más de una edición activa.
 */
export function activeEditionTeamOf(userId: string): Prisma.TeamWhereInput {
  return { userId, edition: ACTIVE_EDITION_WHERE };
}

/**
 * Como `activeEditionTeamOf`, pero también encuentra el equipo en el que el usuario es integrante
 * activo (por su correo) sin ser el líder. Solo para pantallas de lectura del estudiante (nota
 * final, jurados, código de verificación); lo que edita sigue usando `activeEditionTeamOf`.
 * Sin correo se comporta igual que `activeEditionTeamOf`.
 */
export function activeEditionTeamOfLeaderOrMember(
  userId: string,
  email?: string | null,
): Prisma.TeamWhereInput {
  if (!email?.trim()) return activeEditionTeamOf(userId);
  return {
    edition: ACTIVE_EDITION_WHERE,
    OR: [{ userId }, { members: { some: activeMemberByEmail(email) } }],
  };
}

/** Filtro de integrantes de la edición activa (correo y código son únicos por edición). */
export const ACTIVE_EDITION_FILTER: Prisma.EditionWhereInput = ACTIVE_EDITION_WHERE;
