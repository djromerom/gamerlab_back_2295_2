import * as fs from 'fs';
import * as path from 'path';
import { joinStudentNames } from './certificate-content';
import {
  fairDateLong,
  placeAndDateOf,
  placeWithDate,
} from './external-presenter-certificate';

describe('contenido de los certificados (ARK-170)', () => {
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

  it('ARK-256 / ARK-309: la plantilla del diploma no tiene feria ni fecha escritas a mano', () => {
    const dir = path.join(__dirname, 'assets');
    const templates = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
    // Una sola plantilla para todos los diplomas; las viejas (y las «empty», sin uso) ya no existen.
    expect(templates).toEqual(['diploma.html']);
    const html = fs.readFileSync(path.join(dir, 'diploma.html'), 'utf8');
    expect(html).not.toMatch(/V Feria Gamer/);
    expect(html).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
