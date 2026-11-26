/**
 * HU-33 (ARK-194): datos del certificado de asistencia del presentador externo y formato de lugar y
 * fecha de todos los certificados. El armado del HTML (con escape de lo que escribe el administrador)
 * está en `diploma.logic.ts` desde ARK-309.
 */
export interface ExternalPresenterCertificateData {
  presenterName: string;
  organization: string | null;
  presentationTitle: string | null;
  editionTitle: string;
  /** «Barranquilla, 26 de noviembre de 2026» o solo «Barranquilla» sin fecha de feria. */
  placeAndDate: string;
}

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
