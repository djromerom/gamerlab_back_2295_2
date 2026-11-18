/**
 * HU-33 (ARK-194): datos y armado del certificado de asistencia del presentador externo.
 * Función pura: escapa todo lo que escribe el administrador, porque el HTML lo renderiza
 * Gotenberg (un nombre con `<` no debe romper ni inyectar nada en el PDF).
 */
export interface ExternalPresenterCertificateData {
  presenterName: string;
  organization: string | null;
  presentationTitle: string | null;
  editionTitle: string;
  /** «Barranquilla, 26 de noviembre de 2026» o solo «Barranquilla» sin fecha de feria. */
  placeAndDate: string;
}

export const EXTERNAL_PRESENTER_TEMPLATE =
  'certificate-external-presenter.html';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** «26 de noviembre de 2026». */
export function fairDateLong(fairDate: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC', // `fecha_feria` es una fecha sin hora (se guarda a medianoche UTC)
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fairDate);
}

/**
 * ARK-256: formato único de la línea de lugar y fecha de TODOS los certificados (equipo, jurado y
 * presentador externo): «Barranquilla, 26 de noviembre de 2026», o solo «Barranquilla» sin fecha.
 * Recibe la fecha ya escrita en largo («26 de noviembre de 2026») o vacía.
 */
export function placeWithDate(longDate: string): string {
  return longDate ? `Barranquilla, ${longDate}` : 'Barranquilla';
}

/** «Barranquilla, 26 de noviembre de 2026» con la fecha de la feria (cronograma de HU-12). */
export function placeAndDateOf(fairDate: Date | null): string {
  return placeWithDate(fairDate ? fairDateLong(fairDate) : '');
}

export function renderExternalPresenterCertificate(
  template: string,
  data: ExternalPresenterCertificateData,
): string {
  const presentationLine = data.presentationTitle
    ? `<div class="juror-role">Con la presentación «${escapeHtml(data.presentationTitle)}»</div>`
    : '';
  const values: Record<string, string> = {
    presenterName: escapeHtml(data.presenterName),
    presenterOrganization: escapeHtml(data.organization ?? ''),
    editionTitle: escapeHtml(data.editionTitle),
    placeAndDate: escapeHtml(data.placeAndDate),
    presentationLine, // ya escapado arriba
  };
  return template.replace(
    /{{\s*([\w.]+)\s*}}/g,
    (_, key: string) => values[key] ?? '',
  );
}
