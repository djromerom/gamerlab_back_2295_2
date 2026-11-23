import {
  BADGE_HEIGHT_MM,
  BADGE_LAYOUTS,
  BADGE_QR_WIDTH_MM,
  BADGE_WIDTH_MM,
  BadgePaperSize,
  badgesPerPage,
  buildBadgesHtml,
  DEFAULT_BADGE_PAPER_SIZE,
} from './badge-template';

const cards = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Jurado ${i + 1}`,
    qrDataUri: 'data:image/png;base64,AAA',
  }));

const sheetCount = (html: string) =>
  (html.match(/<div class="sheet">/g) ?? []).length;

const tabloid = BADGE_LAYOUTS[BadgePaperSize.TABLOID];
const letter = BADGE_LAYOUTS[BadgePaperSize.LETTER];

describe('buildBadgesHtml', () => {
  it('escarapelas de 5,4 x 6 cm con QR de 5 cm de ancho', () => {
    const html = buildBadgesHtml(cards(1));
    expect(BADGE_WIDTH_MM).toBe(54);
    expect(BADGE_HEIGHT_MM).toBe(60);
    expect(BADGE_QR_WIDTH_MM).toBe(50);
    expect(html).toContain('width: 54mm; height: 60mm;');
    expect(html).toContain('.qr { width: 50mm; height: 50mm;');
  });

  it('por defecto usa tabloide', () => {
    expect(DEFAULT_BADGE_PAPER_SIZE).toBe(BadgePaperSize.TABLOID);
    expect(buildBadgesHtml(cards(1))).toBe(buildBadgesHtml(cards(1), tabloid));
  });

  describe('tabloide', () => {
    it('pide a Gotenberg 11 x 17 in vertical sin márgenes', () => {
      expect(tabloid.page).toEqual({
        paperWidth: '11in',
        paperHeight: '17in',
        margin: '0',
      });
      expect(buildBadgesHtml(cards(1), tabloid)).toContain(
        '@page { size: 279.4mm 431.8mm; margin: 0; }',
      );
    });

    it('5 columnas x 7 filas = 35 por hoja y caben', () => {
      expect(badgesPerPage(tabloid)).toBe(35);
      expect(tabloid.columns * BADGE_WIDTH_MM).toBeLessThanOrEqual(
        tabloid.widthMm,
      );
      expect(tabloid.rows * BADGE_HEIGHT_MM).toBeLessThanOrEqual(
        tabloid.heightMm,
      );
    });

    it.each([
      [1, 1],
      [35, 1],
      [36, 2],
      [71, 3],
    ])('%i escarapelas ocupan %i hojas', (n, sheets) => {
      const html = buildBadgesHtml(cards(n), tabloid);
      expect(sheetCount(html)).toBe(sheets);
      expect(html.match(/<div class="badge">/g)).toHaveLength(n);
    });
  });

  describe('carta', () => {
    it('pide a Gotenberg carta horizontal (11 x 8,5 in) sin márgenes', () => {
      expect(letter.page).toEqual({
        paperWidth: '11in',
        paperHeight: '8.5in',
        margin: '0',
      });
      expect(buildBadgesHtml(cards(1), letter)).toContain(
        '@page { size: 279.4mm 215.9mm; margin: 0; }',
      );
    });

    it('5 columnas x 3 filas = 15 por hoja y caben', () => {
      expect(badgesPerPage(letter)).toBe(15);
      expect(letter.columns * BADGE_WIDTH_MM).toBeLessThanOrEqual(
        letter.widthMm,
      );
      expect(letter.rows * BADGE_HEIGHT_MM).toBeLessThanOrEqual(
        letter.heightMm,
      );
    });

    it.each([
      [15, 1],
      [16, 2],
      [31, 3],
    ])('%i escarapelas ocupan %i hojas', (n, sheets) => {
      expect(sheetCount(buildBadgesHtml(cards(n), letter))).toBe(sheets);
    });
  });

  it('solo lleva el nombre (escapado) y el QR', () => {
    const html = buildBadgesHtml([
      { name: '<b>Ana</b>', qrDataUri: 'data:image/png;base64,AAA' },
    ]);
    expect(html).toContain('<div class="name">&lt;b&gt;Ana&lt;/b&gt;</div>');
    expect(html).toContain('<img class="qr" src="data:image/png;base64,AAA"');
    expect(html).not.toMatch(/class="(edition|category|meta)"/);
    expect(html).not.toContain('Jurado');
  });
});
