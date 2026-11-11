import { escapeHtml } from './external-presenter-certificate';

/**
 * ARK-170 (TA-19): armado puro del contenido de los certificados.
 *
 * Todos los valores se escapan: el HTML lo renderiza Chromium (Gotenberg) y los nombres de equipo,
 * juego e integrantes los escribe el estudiante.
 */
export function fillCertificateTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) =>
    escapeHtml(values[key] ?? ''),
  );
}

/** «26/11/2026», o vacío si la feria no tiene fecha en el cronograma (HU-12). */
export function fairDateNumeric(fairDate: Date | null): string {
  if (!fairDate) return '';
  // `fecha_feria` es una fecha sin hora: se guarda a medianoche UTC.
  const day = String(fairDate.getUTCDate()).padStart(2, '0');
  const month = String(fairDate.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${fairDate.getUTCFullYear()}`;
}

/** «Barranquilla 26/11/2026», como en los certificados de ferias anteriores. */
export function placeWithDate(eventDate: string): string {
  return eventDate ? `Barranquilla ${eventDate}` : 'Barranquilla';
}

/** «Ana, Luis y Marta». */
export function joinStudentNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
