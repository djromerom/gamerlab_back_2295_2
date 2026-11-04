import { EditionStatus, Prisma } from '@prisma/client';

/**
 * ARK-128 (BG-17): un usuario lidera a lo sumo un equipo por edición, pero puede tener equipos
 * de ediciones anteriores. "El equipo del usuario" es el de la edición activa; los de ediciones
 * pasadas no cuentan (para eso está el histórico). Úsalo con `findFirst` y
 * `orderBy: { editionId: 'desc' }` por si hubiera más de una edición activa.
 */
export function activeEditionTeamOf(userId: string): Prisma.TeamWhereInput {
  return { userId, edition: { status: EditionStatus.ACTIVE } };
}

/** Filtro de integrantes de la edición activa (correo y código son únicos por edición). */
export const ACTIVE_EDITION_FILTER: Prisma.EditionWhereInput = {
  status: EditionStatus.ACTIVE,
};
