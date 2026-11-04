import { Prisma } from '@prisma/client';
import { ACTIVE_EDITION_WHERE } from '../editions/active-edition';

/**
 * ARK-128 (BG-17): un usuario lidera a lo sumo un equipo por edición, pero puede tener equipos
 * de ediciones anteriores. "El equipo del usuario" es el de la edición activa; los de ediciones
 * pasadas no cuentan (para eso está el histórico). Úsalo con `findFirst` y
 * `orderBy: { editionId: 'desc' }` por si hubiera más de una edición activa.
 */
export function activeEditionTeamOf(userId: string): Prisma.TeamWhereInput {
  return { userId, edition: ACTIVE_EDITION_WHERE };
}

/** Filtro de integrantes de la edición activa (correo y código son únicos por edición). */
export const ACTIVE_EDITION_FILTER: Prisma.EditionWhereInput = ACTIVE_EDITION_WHERE;
