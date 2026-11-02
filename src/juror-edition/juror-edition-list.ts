import { JurorEditionStatus } from '@prisma/client';
import { ListEditionJurorsQueryDto } from './dto/list-edition-jurors-query.dto';
import {
  AUTOMATIC_STATUS,
  EditionJurorCounts,
  EditionJurorItem,
  JurorEditionListStatus,
} from './juror-edition.types';

/** Pendientes primero (lo que falta decidir), luego el resto. */
const STATUS_ORDER: Record<JurorEditionListStatus, number> = {
  [JurorEditionStatus.PENDING]: 0,
  [JurorEditionStatus.CONFIRMED]: 1,
  [JurorEditionStatus.DECLINED]: 2,
  [AUTOMATIC_STATUS]: 3,
};

/** Minúsculas y sin tildes, para que "jose" encuentre a "José". */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesSearch(item: EditionJurorItem, search: string): boolean {
  const haystack = normalizeText(
    `${item.firstName} ${item.lastName} ${item.email}`,
  );
  return normalizeText(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function compareItems(a: EditionJurorItem, b: EditionJurorItem): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    a.lastName.localeCompare(b.lastName, 'es', { sensitivity: 'base' }) ||
    a.firstName.localeCompare(b.firstName, 'es', { sensitivity: 'base' }) ||
    a.jurorId.localeCompare(b.jurorId)
  );
}

export function emptyCounts(): EditionJurorCounts {
  return { PENDING: 0, CONFIRMED: 0, DECLINED: 0, AUTOMATIC: 0 };
}

/**
 * Filtra, cuenta, ordena y pagina la lista completa de la edición (son cientos de filas a lo
 * sumo). `counts` respeta la búsqueda y el tipo, pero no el filtro de estado: alimenta las
 * pestañas de la página.
 */
export function buildPage(
  items: EditionJurorItem[],
  query: Pick<
    ListEditionJurorsQueryDto,
    'status' | 'type' | 'search' | 'page' | 'limit'
  >,
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const base = items.filter(
    (item) =>
      (!query.type || item.type === query.type) &&
      (!query.search || matchesSearch(item, query.search)),
  );

  const counts = emptyCounts();
  for (const item of base) counts[item.status] += 1;

  const filtered = base
    .filter((item) => !query.status || item.status === query.status)
    .sort(compareItems);

  const data = filtered.slice((page - 1) * limit, page * limit);
  return {
    data,
    metadata: {
      totalItems: filtered.length,
      itemsOnCurrentPage: data.length,
      currentPage: page,
      itemsPerPage: limit,
      totalPages: Math.ceil(filtered.length / limit),
    },
    counts,
  };
}
