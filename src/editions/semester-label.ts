/**
 * BG-63 (ARK-263): etiqueta legible del semestre de una feria, la misma en el panel del
 * profesor, el Excel y el front. `Edition.semester` guarda 10 (primer semestre),
 * 20 (intersemestral) o 30 (segundo semestre); nunca se muestra el código crudo
 * («2026-30») ni «S20».
 */
const SEMESTER_LABELS: Record<number, string> = {
  10: '1',
  20: 'Intersemestral',
  30: '2',
};

/** «1», «Intersemestral» o «2»; otro valor, tal cual. */
export function semesterLabel(semester: number): string {
  return SEMESTER_LABELS[semester] ?? String(semester);
}

/** «2026 - 2», «2026 - 1» o «2026 - Intersemestral». */
export function editionPeriodLabel(edition: {
  year: number;
  semester: number;
}): string {
  return `${edition.year} - ${semesterLabel(edition.semester)}`;
}

/** Para nombres de archivo, sin espacios: «2026-2», «2026-1» o «2026-intersemestral». */
export function editionPeriodSlug(edition: {
  year: number;
  semester: number;
}): string {
  return `${edition.year}-${semesterLabel(edition.semester).toLowerCase()}`;
}
