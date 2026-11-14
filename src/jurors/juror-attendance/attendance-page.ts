import { normalizeText } from 'src/jurors/juror-edition/juror-edition-list';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import {
  AttendanceRow,
  AttendanceTotals,
  JurorAttendanceItem,
} from './juror-attendance.types';

export const DEFAULT_ATTENDANCE_LIMIT = 50;

/** Solo nombre y apellido: cada palabra de la búsqueda debe aparecer (sin tildes). */
function matchesSearch(row: AttendanceRow, search: string): boolean {
  const haystack = normalizeText(`${row.firstName} ${row.lastName}`);
  return normalizeText(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

const byName = (a: AttendanceRow, b: AttendanceRow): number =>
  a.lastName.localeCompare(b.lastName, 'es', { sensitivity: 'base' }) ||
  a.firstName.localeCompare(b.firstName, 'es', { sensitivity: 'base' }) ||
  a.item.jurorId.localeCompare(b.item.jurorId);

/**
 * Faltantes primero (por apellido), luego presentes con el último en llegar arriba: así, al
 * escanear una escarapela, la fila que cambia queda a la vista.
 */
export function compareRows(a: AttendanceRow, b: AttendanceRow): number {
  const aPresent = a.item.checkedInAt !== null;
  const bPresent = b.item.checkedInAt !== null;
  if (aPresent !== bPresent) return aPresent ? 1 : -1;
  if (aPresent && bPresent) {
    const diff = b.item.checkedInAt!.getTime() - a.item.checkedInAt!.getTime();
    if (diff !== 0) return diff;
  }
  return byName(a, b);
}

/**
 * Busca, cuenta, filtra por estado, ordena y pagina (son cientos de filas a lo sumo).
 * `totals` respeta la búsqueda pero no el filtro de estado: alimenta las pestañas.
 */
export function buildAttendancePage(
  rows: AttendanceRow[],
  query: Partial<
    Pick<ListAttendanceQueryDto, 'status' | 'search' | 'page' | 'limit'>
  >,
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? DEFAULT_ATTENDANCE_LIMIT;

  const base = query.search
    ? rows.filter((row) => matchesSearch(row, query.search!))
    : rows;

  const present = base.filter((row) => row.item.status === 'PRESENT').length;
  const totals: AttendanceTotals = {
    present,
    missing: base.length - present,
    total: base.length,
  };

  const filtered = base
    .filter((row) => !query.status || row.item.status === query.status)
    .sort(compareRows);

  const data: JurorAttendanceItem[] = filtered
    .slice((page - 1) * limit, page * limit)
    .map((row) => row.item);

  return {
    totals,
    data,
    metadata: {
      totalItems: filtered.length,
      itemsOnCurrentPage: data.length,
      currentPage: page,
      itemsPerPage: limit,
      totalPages: Math.ceil(filtered.length / limit),
    },
  };
}
