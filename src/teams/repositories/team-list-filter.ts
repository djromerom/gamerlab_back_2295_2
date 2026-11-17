// src/teams/repositories/team-list-filter.ts
import { BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { matchesAllWords } from '../../common/utils/search-text';

/**
 * BG-53 (ARK-253): filtros de GET /teams que se aplican en la consulta, no en la página que ya
 * cargó el front. Así una búsqueda encuentra equipos de cualquier página y `metaData.totalItems`
 * es el total filtrado.
 */
export const TEAM_ORIGINS = ['uninorte', 'externo'] as const;
export type TeamOrigin = (typeof TEAM_ORIGINS)[number];

export interface TeamListFilters {
  /** Sin tildes ni mayúsculas; cada palabra debe estar en nombre del equipo + juego + código. */
  search?: string;
  /** `externo` → `Team.isExternal = true`; `uninorte` → `false`. */
  origin?: TeamOrigin;
}

/** Valida `search` y `origin` del query string. Vacíos = sin filtro; `origin` desconocido → 400. */
export function parseTeamListFilters(search?: unknown, origin?: unknown): TeamListFilters {
  const filters: TeamListFilters = {};
  if (search !== undefined) {
    if (typeof search !== 'string') {
      throw new BadRequestException('search debe ser un texto');
    }
    if (search.trim()) filters.search = search.trim();
  }
  if (origin !== undefined && origin !== '') {
    if (typeof origin !== 'string' || !(TEAM_ORIGINS as readonly string[]).includes(origin)) {
      throw new BadRequestException('origin debe ser «uninorte» o «externo»');
    }
    filters.origin = origin as TeamOrigin;
  }
  return filters;
}

/** `where` del listado: edición y origen. Sin ninguno devuelve `undefined`, como antes. */
export function buildTeamListWhere(
  editionId: number | undefined,
  filters: TeamListFilters = {},
): Prisma.TeamWhereInput | undefined {
  const where: Prisma.TeamWhereInput = {};
  if (editionId !== undefined) where.editionId = editionId;
  if (filters.origin) where.isExternal = filters.origin === 'externo';
  return Object.keys(where).length > 0 ? where : undefined;
}

type SearchableTeam = { id: number; teamName: string; teamCode: string; videogame: { name: string } | null };

/** Texto en el que se busca: solo datos públicos (nunca correos, integrantes ni `verificationCode`). */
export function teamSearchText(team: SearchableTeam): string {
  return [team.teamName, team.videogame?.name ?? '', team.teamCode].join(' ');
}

/** Ids de los equipos que contienen todas las palabras de `search`, en el orden recibido. */
export function filterTeamIdsBySearch(teams: SearchableTeam[], search: string): number[] {
  return teams.filter((team) => matchesAllWords(teamSearchText(team), search)).map((team) => team.id);
}

/**
 * `where` final del listado. Con `search`, trae solo id, nombre, código y juego de los equipos que
 * cumplen el `where` base (una edición, unos cientos), filtra en memoria (Postgres no ignora tildes
 * y no usamos `unaccent`) y restringe a esos ids; el orden y la paginación siguen en la BD.
 */
export async function resolveTeamListWhere(
  prisma: Pick<PrismaClient, 'team'>,
  editionId: number | undefined,
  filters: TeamListFilters = {},
): Promise<Prisma.TeamWhereInput | undefined> {
  const where = buildTeamListWhere(editionId, filters);
  if (!filters.search) return where;
  const candidates = await prisma.team.findMany({
    where,
    select: { id: true, teamName: true, teamCode: true, videogame: { select: { name: true } } },
  });
  return { ...where, id: { in: filterTeamIdsBySearch(candidates, filters.search) } };
}
