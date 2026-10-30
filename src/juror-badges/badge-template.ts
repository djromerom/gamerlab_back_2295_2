export interface BadgeCard {
  name: string;
  category: string;
  qrDataUri: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * HTML imprimible (A4, 2 columnas x 4 filas) con una escarapela por jurado.
 * El QR contiene solo el token opaco; el nombre y la categoría son texto visible.
 */
export function buildBadgesHtml(
  cards: BadgeCard[],
  editionTitle: string,
): string {
  const items = cards
    .map(
      (card) => `
      <div class="badge">
        <div class="edition">${escapeHtml(editionTitle)}</div>
        <div class="name">${escapeHtml(card.name)}</div>
        <div class="category">${escapeHtml(card.category)}</div>
        <img class="qr" src="${card.qrDataUri}" alt="QR" />
      </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
    .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
    .badge { border: 1px solid #333; border-radius: 4mm; height: 62mm; padding: 4mm;
      box-sizing: border-box; text-align: center; page-break-inside: avoid;
      display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
    .edition { font-size: 9pt; color: #555; }
    .name { font-size: 15pt; font-weight: bold; }
    .category { font-size: 10pt; text-transform: uppercase; letter-spacing: 1px; }
    .qr { width: 30mm; height: 30mm; }
  </style>
</head>
<body><div class="sheet">${items}</div></body>
</html>`;
}
