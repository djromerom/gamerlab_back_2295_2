import { readFileSync } from 'fs';
import { join } from 'path';
import {
  EXTERNAL_PRESENTER_TEMPLATE,
  escapeHtml,
  placeAndDateOf,
  renderExternalPresenterCertificate,
} from './external-presenter-certificate';

/** HU-33 (ARK-194): armado del certificado del presentador externo. */
describe('Certificado del presentador externo', () => {
  const template = readFileSync(
    join(__dirname, 'assets', EXTERNAL_PRESENTER_TEMPLATE),
    'utf8',
  );
  const data = {
    presenterName: 'Ana Pérez',
    organization: 'Estudio Indie Caribe',
    presentationTitle: 'Diseño de niveles',
    editionTitle: 'Feria Gamer 2026 - S2',
    placeAndDate: 'Barranquilla, 26 de noviembre de 2026',
  };

  it('pone nombre, organización, título, edición y fecha', () => {
    const html = renderExternalPresenterCertificate(template, data);
    expect(html).toContain('Ana Pérez');
    expect(html).toContain('Estudio Indie Caribe');
    expect(html).toContain('Con la presentación «Diseño de niveles»');
    expect(html).toContain(
      'Asistió como presentador externo a Feria Gamer 2026 - S2',
    );
    expect(html).toContain('Barranquilla, 26 de noviembre de 2026');
    expect(html).not.toMatch(/{{\s*\w+\s*}}/);
    // No hereda el texto fijo del certificado de jurado
    expect(html).not.toContain('como Jurado');
    expect(html).not.toContain('28/05/2026');
  });

  it('sin organización ni título no deja huecos con texto suelto', () => {
    const html = renderExternalPresenterCertificate(template, {
      ...data,
      organization: null,
      presentationTitle: null,
    });
    expect(html).not.toContain('Con la presentación');
    expect(html).not.toContain('null');
  });

  it('escapa lo que escribe el administrador', () => {
    const html = renderExternalPresenterCertificate(template, {
      ...data,
      presenterName: '<script>alert(1)</script>',
      presentationTitle: 'A & "B"',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('«A &amp; &quot;B&quot;»');
  });

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
