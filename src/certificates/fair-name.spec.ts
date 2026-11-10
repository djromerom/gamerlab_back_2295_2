import { fairNameOf } from './fair-name';

describe('fairNameOf (ARK-170)', () => {
  it.each([
    [2024, 30, 'II Feria Gamer'],
    [2025, 10, 'III Feria Gamer'],
    [2025, 30, 'IV Feria Gamer'],
    [2026, 10, 'V Feria Gamer'],
    [2026, 30, 'VI Feria Gamer'],
    [2027, 10, 'VII Feria Gamer'],
    [2028, 30, 'X Feria Gamer'],
  ])('%i-%i es la %s', (year, semester, expected) => {
    expect(fairNameOf({ year, semester, title: 'Título' })).toBe(expected);
  });

  it('no usa el título de la edición cuando el periodo es de una feria', () => {
    expect(
      fairNameOf({ year: 2026, semester: 30, title: 'Edición de Prueba - Viernes' }),
    ).toBe('VI Feria Gamer');
  });

  it.each([
    [2026, 20],
    [2023, 30],
  ])('%i-%i no es una feria: usa el título', (year, semester) => {
    expect(fairNameOf({ year, semester, title: 'Taller' })).toBe('Taller');
  });
});
