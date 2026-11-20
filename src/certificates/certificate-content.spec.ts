import * as fs from 'fs';
import * as path from 'path';
import {
  fillCertificateTemplate,
  joinStudentNames,
} from './certificate-content';
import {
  fairDateLong,
  placeAndDateOf,
  placeWithDate,
} from './external-presenter-certificate';

describe('contenido de los certificados (ARK-170)', () => {
  it('escapa lo que escribe el estudiante', () => {
    const html = fillCertificateTemplate('<p>{{ teamName }}</p>', {
      teamName: '<img src=x onerror=alert(1)> & "Cía"',
    });
    expect(html).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Cía&quot;</p>',
    );
  });

  it('una variable sin valor queda vacía', () => {
    expect(fillCertificateTemplate('[{{ nada }}]', {})).toBe('[]');
  });

  it('ARK-256: un solo formato de lugar y fecha, sin correrse por la zona horaria', () => {
    const day = new Date('2026-11-26T00:00:00.000Z');
    expect(fairDateLong(day)).toBe('26 de noviembre de 2026');
    expect(placeWithDate('26 de noviembre de 2026')).toBe(
      'Barranquilla, 26 de noviembre de 2026',
    );
    expect(placeAndDateOf(day)).toBe('Barranquilla, 26 de noviembre de 2026');
    expect(placeWithDate('')).toBe('Barranquilla');
    expect(placeAndDateOf(null)).toBe('Barranquilla');
  });

  it('une los nombres de los integrantes', () => {
    expect(joinStudentNames([])).toBe('');
    expect(joinStudentNames(['Ana'])).toBe('Ana');
    expect(joinStudentNames(['Ana', 'Luis', 'Marta'])).toBe(
      'Ana, Luis y Marta',
    );
  });

  describe.each([
    'certificate-First.html',
    'certificate-Second.html',
    'certificate-Third.html',
    'certificate-printable.html',
    'certificate-juror.html',
  ])('plantilla %s', (name) => {
    const html = fs.readFileSync(path.join(__dirname, 'assets', name), 'utf8');

    it('toma la edición de los datos y no tiene feria ni fecha fijas', () => {
      expect(html).toContain('{{ fairName }}');
      expect(html).not.toMatch(/V Feria Gamer/);
      expect(html).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  it('ARK-256: ninguna plantilla de assets/ tiene una fecha dd/mm/aaaa escrita a mano', () => {
    const dir = path.join(__dirname, 'assets');
    // Las plantillas «empty» son moldes sin uso en el código; las demás se envían a los usuarios.
    const used = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.html') && !f.startsWith('certificate-empty'));
    expect(used.length).toBeGreaterThanOrEqual(6);
    expect(used).not.toContain('certificate.html');
    for (const name of used) {
      const html = fs.readFileSync(path.join(dir, name), 'utf8');
      expect({ name, hardcoded: html.match(/\d{2}\/\d{2}\/\d{4}/g) }).toEqual({
        name,
        hardcoded: null,
      });
    }
  });
});
