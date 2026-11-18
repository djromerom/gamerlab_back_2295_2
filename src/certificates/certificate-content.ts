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

/** «Ana, Luis y Marta». */
export function joinStudentNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
