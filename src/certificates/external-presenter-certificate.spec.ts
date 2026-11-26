import { escapeHtml, placeAndDateOf } from './external-presenter-certificate';

/** HU-33 (ARK-194): formato de lugar y fecha y escape del certificado del presentador externo. */
describe('Certificado del presentador externo', () => {
  it('escapeHtml', () => {
    expect(escapeHtml(`<a href='x'>&</a>`)).toBe(
      '&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('lugar y fecha con el cronograma de la feria; sin cronograma, solo la ciudad', () => {
    expect(placeAndDateOf(new Date('2026-11-26T00:00:00Z'))).toBe(
      'Barranquilla, 26 de noviembre de 2026',
    );
    expect(placeAndDateOf(null)).toBe('Barranquilla');
  });
});
