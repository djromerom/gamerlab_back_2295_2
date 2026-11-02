import * as ExcelJS from 'exceljs';
import { JurorCategory, JurorType } from '@prisma/client';

/**
 * HU-16 (ARK-108): reporte de jurados con la asignación de la edición, para enviarlo a Rocío.
 * Sin acceso a la base: arma filas, nombre del archivo y el libro de Excel.
 */

export interface JurorAssignmentSource {
  firstName: string | null;
  lastName: string | null;
  email: string;
  status: string | null;
  jurorCategory: JurorCategory | null;
  jurorType: JurorType | null;
  assigned: {
    teamCode: string;
    videogameId: number | null;
    videogameName: string | null;
  }[];
  evaluatedVideogameIds: number[];
}

export interface JurorAssignmentRow {
  nombre: string;
  correo: string;
  estado: string;
  categoria: string;
  tipo: string;
  niveles: string;
  totalAsignados: number;
  asignados: string[];
  revisados: string[];
  pendientes: string[];
}

const CATEGORY_LABEL: Record<JurorCategory, string> = {
  JUNIOR: 'Junior',
  SENIOR: 'Senior',
};

const TYPE_LABEL: Record<JurorType, string> = {
  OFFICIAL: 'Oficial',
  BACKUP: 'Suplente',
};

/** `N2-IST-201` → `N2`; null si el código no trae nivel. */
export function teamLevel(teamCode: string): string | null {
  const match = /^N(\d+)-/i.exec(teamCode.trim());
  return match ? `N${match[1]}` : null;
}

function groupLabel(group: JurorAssignmentSource['assigned'][number]): string {
  return group.videogameName
    ? `${group.teamCode} · ${group.videogameName}`
    : group.teamCode;
}

export function toJurorAssignmentRow(
  src: JurorAssignmentSource,
): JurorAssignmentRow {
  const evaluated = new Set(src.evaluatedVideogameIds);
  const groups = [...src.assigned].sort((a, b) =>
    a.teamCode.localeCompare(b.teamCode, 'es', { numeric: true }),
  );
  const levels = [
    ...new Set(
      groups.map((g) => teamLevel(g.teamCode)).filter((l): l is string => !!l),
    ),
  ].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const isDone = (g: (typeof groups)[number]) =>
    g.videogameId !== null && evaluated.has(g.videogameId);

  return {
    nombre:
      [src.firstName, src.lastName].filter(Boolean).join(' ').trim() ||
      'Nombre no disponible',
    correo: src.email,
    estado: src.status ?? 'Sin estado',
    categoria: src.jurorCategory
      ? CATEGORY_LABEL[src.jurorCategory]
      : 'Sin categoría',
    tipo: src.jurorType ? TYPE_LABEL[src.jurorType] : 'Sin tipo',
    niveles: levels.join(', '),
    totalAsignados: groups.length,
    asignados: groups.map(groupLabel),
    revisados: groups.filter(isDone).map(groupLabel),
    pendientes: groups.filter((g) => !isDone(g)).map(groupLabel),
  };
}

/** Oficiales antes que suplentes; luego por nombre. */
export function sortJurorAssignmentRows(
  rows: JurorAssignmentRow[],
): JurorAssignmentRow[] {
  const typeOrder = (t: string) =>
    t === 'Oficial' ? 0 : t === 'Suplente' ? 1 : 2;
  return [...rows].sort(
    (a, b) =>
      typeOrder(a.tipo) - typeOrder(b.tipo) ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
}

/** Fecha local de Colombia (la feria es en Barranquilla), `YYYY-MM-DD`. */
export function bogotaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** `asignacion_jurados_<año>-<semestre>_<fecha>.xlsx`, como el reporte de calificaciones (HU-02). */
export function buildJurorAssignmentFileName(
  edition: { year: number; semester: number },
  date: Date = new Date(),
): string {
  return `asignacion_jurados_${edition.year}-${edition.semester}_${bogotaDate(date)}.xlsx`;
}

export const JUROR_ASSIGNMENT_COLUMNS: {
  header: string;
  key: keyof JurorAssignmentRow;
  width: number;
}[] = [
  { header: 'Nombre jurado', key: 'nombre', width: 30 },
  { header: 'Correo', key: 'correo', width: 32 },
  { header: 'Estado', key: 'estado', width: 14 },
  { header: 'Categoría', key: 'categoria', width: 12 },
  { header: 'Tipo', key: 'tipo', width: 12 },
  { header: 'Niveles', key: 'niveles', width: 12 },
  { header: 'N.º grupos', key: 'totalAsignados', width: 11 },
  { header: 'Grupos asignados', key: 'asignados', width: 45 },
  { header: 'Grupos revisados', key: 'revisados', width: 45 },
  { header: 'Grupos pendientes', key: 'pendientes', width: 45 },
];

const LIST_KEYS = new Set<keyof JurorAssignmentRow>([
  'asignados',
  'revisados',
  'pendientes',
]);

export function buildJurorAssignmentWorkbook(
  rows: JurorAssignmentRow[],
  editionTitle: string,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.title = `Asignación de jurados · ${editionTitle}`;
  const sheet = workbook.addWorksheet('Asignación de jurados');
  sheet.columns = JUROR_ASSIGNMENT_COLUMNS.map((c) => ({ ...c }));

  const header = sheet.getRow(1);
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD6EAF8' },
    };
  });

  for (const row of rows) {
    // Un grupo por línea dentro de la celda
    const values: Record<string, string | number> = {};
    for (const c of JUROR_ASSIGNMENT_COLUMNS) {
      const v = row[c.key];
      values[c.key] = Array.isArray(v) ? v.join('\n') : v;
    }
    sheet.addRow(values);
  }

  sheet.columns.forEach((col, i) => {
    const key = JUROR_ASSIGNMENT_COLUMNS[i].key;
    col.alignment = LIST_KEYS.has(key)
      ? { wrapText: true, vertical: 'top', horizontal: 'left' }
      : { vertical: 'top', horizontal: 'left' };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: JUROR_ASSIGNMENT_COLUMNS.length },
  };
  return workbook;
}
