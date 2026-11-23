import type { PdfPageOptions } from 'src/certificates/certificates.service';

/**
 * Escarapela de 5,4 x 6 cm: solo el nombre y el QR de 5 cm de ancho, que es lo importante. El
 * recuadro deja 2 mm alrededor del QR para que quepan las más posibles. Mide lo mismo en todos los
 * tamaños de hoja, así el corte es igual. Van pegadas (los cortes coinciden) y centradas.
 * HU-35 (ARK-172): no muestra junior ni senior; la categoría sigue en la lista y en el check-in.
 */
export const BADGE_WIDTH_MM = 54;
export const BADGE_HEIGHT_MM = 60;
export const BADGE_QR_WIDTH_MM = 50;

/** Tamaños de hoja que el administrador puede elegir al descargar el PDF. */
export enum BadgePaperSize {
  TABLOID = 'TABLOID',
  LETTER = 'LETTER',
}
export const DEFAULT_BADGE_PAPER_SIZE = BadgePaperSize.TABLOID;

export interface BadgeSheetLayout {
  /** Lo que se le pide a Gotenberg. */
  page: PdfPageOptions;
  widthMm: number;
  heightMm: number;
  columns: number;
  rows: number;
  /** Para el nombre del archivo descargado. */
  fileLabel: string;
}

export const BADGE_LAYOUTS: Record<BadgePaperSize, BadgeSheetLayout> = {
  // Tabloide vertical (11 x 17 in): 5 x 7 = 35 por hoja (270 x 420 mm).
  [BadgePaperSize.TABLOID]: {
    page: { paperWidth: '11in', paperHeight: '17in', margin: '0' },
    widthMm: 279.4,
    heightMm: 431.8,
    columns: 5,
    rows: 7,
    fileLabel: 'tabloide',
  },
  // Carta horizontal (11 x 8,5 in): 5 x 3 = 15 por hoja (270 x 180 mm). En vertical solo caben 12.
  [BadgePaperSize.LETTER]: {
    page: { paperWidth: '11in', paperHeight: '8.5in', margin: '0' },
    widthMm: 279.4,
    heightMm: 215.9,
    columns: 5,
    rows: 3,
    fileLabel: 'carta',
  },
};

export const badgesPerPage = (layout: BadgeSheetLayout): number =>
  layout.columns * layout.rows;

export interface BadgeCard {
  name: string;
  qrDataUri: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

/**
 * HTML imprimible con una escarapela por jurado en la hoja elegida (35 por hoja en tabloide,
 * 15 en carta). El QR contiene solo el token opaco; el nombre es el único texto visible.
 * Cada hoja es un bloque propio para que ninguna escarapela quede partida entre dos páginas.
 */
export function buildBadgesHtml(
  cards: BadgeCard[],
  layout: BadgeSheetLayout = BADGE_LAYOUTS[DEFAULT_BADGE_PAPER_SIZE],
): string {
  const sideMargin = (layout.widthMm - layout.columns * BADGE_WIDTH_MM) / 2;
  const topMargin = (layout.heightMm - layout.rows * BADGE_HEIGHT_MM) / 2;
  const sheets = chunk(cards, badgesPerPage(layout))
    .map(
      (page) => `
    <div class="sheet">${page
      .map(
        (card) => `
      <div class="badge">
        <div class="name">${escapeHtml(card.name)}</div>
        <img class="qr" src="${card.qrDataUri}" alt="QR" />
      </div>`,
      )
      .join('')}
    </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${layout.widthMm}mm ${layout.heightMm}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .sheet { display: grid;
      grid-template-columns: repeat(${layout.columns}, ${BADGE_WIDTH_MM}mm);
      grid-auto-rows: ${BADGE_HEIGHT_MM}mm;
      padding: ${topMargin.toFixed(1)}mm ${sideMargin.toFixed(1)}mm 0;
      break-after: page; }
    .sheet:last-child { break-after: auto; }
    .badge { width: ${BADGE_WIDTH_MM}mm; height: ${BADGE_HEIGHT_MM}mm; box-sizing: border-box;
      border: 0.2mm solid #999; padding: 1.8mm 2mm 2mm; text-align: center; overflow: hidden;
      display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
    .name { font-size: 7pt; font-weight: bold; line-height: 1.1; overflow-wrap: anywhere;
      max-height: 2.2em; overflow: hidden; }
    .qr { width: ${BADGE_QR_WIDTH_MM}mm; height: ${BADGE_QR_WIDTH_MM}mm; flex: none; }
  </style>
</head>
<body>${sheets}</body>
</html>`;
}
