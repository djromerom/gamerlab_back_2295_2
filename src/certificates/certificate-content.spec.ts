import * as fs from 'fs';
import * as path from 'path';
import {
  fairDateNumeric,
  fillCertificateTemplate,
  joinStudentNames,
} from './certificate-content';

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

  it('la fecha numérica no se corre por la zona horaria y es vacía sin cronograma', () => {
    expect(fairDateNumeric(new Date('2026-11-26T00:00:00.000Z'))).toBe(
      '26/11/2026',
    );
    expect(fairDateNumeric(null)).toBe('');
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
});
