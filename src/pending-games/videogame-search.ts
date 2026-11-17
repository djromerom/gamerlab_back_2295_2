import { Prisma } from '@prisma/client';
import { matchesAllWords } from 'src/common/utils/search-text';

/**
 * BG-60 (ARK-260): búsqueda de Pendientes y Calificados del jurado, sin tildes ni mayúsculas y
 * también por código de equipo («202» o «N2-AYP-202»). Se filtra en memoria sobre los juegos
 * del jurado, que son pocos.
 *
 * Integrantes con todos sus NRC (la lista solo muestra el primero) y la materia con su código,
 * para poder buscar por ellos.
 */
export const SEARCHABLE_MEMBER_SELECT = {
  firstName: true,
  lastName: true,
  nrcs: {
    select: {
      code: true,
      subject: { select: { code: true, name: true } },
    },
  },
} satisfies Prisma.MemberSelect;

type SearchableMember = Prisma.MemberGetPayload<{
  select: typeof SEARCHABLE_MEMBER_SELECT;
}>;

export interface SearchableVideogame {
  name: string;
  team?: {
    teamName: string;
    teamCode: string;
    members: SearchableMember[];
  } | null;
}

/** Juego, equipo, código del equipo, integrantes, NRC y materia (código y nombre). */
function searchableText({ name, team }: SearchableVideogame): string {
  const parts = [name, team?.teamName, team?.teamCode];
  for (const member of team?.members ?? []) {
    parts.push(member.firstName, member.lastName);
    for (const nrc of member.nrcs ?? []) {
      parts.push(String(nrc.code), nrc.subject?.code, nrc.subject?.name);
    }
  }
  return parts.filter(Boolean).join(' ');
}

/** Conserva el orden; cada palabra de la búsqueda debe aparecer. Vacía = todos. */
export function filterVideogamesBySearch<T extends SearchableVideogame>(
  games: T[],
  query: string,
): T[] {
  return games.filter((game) => matchesAllWords(searchableText(game), query));
}

/** Para mostrar: solo el primer NRC de cada integrante, como cuando la consulta usaba `take: 1`. */
export function firstNrcOnly<M extends { nrcs: unknown[] }>(
  members: M[] = [],
): M[] {
  return members.map((member) => ({
    ...member,
    nrcs: member.nrcs.slice(0, 1),
  }));
}
