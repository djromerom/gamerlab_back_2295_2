import { matchesAllWords, normalizeSearchText } from './search-text';

describe('normalizeSearchText (BG-60)', () => {
  it('quita tildes, diéresis y la virgulilla de la ñ, pasa a minúsculas y recorta', () => {
    expect(normalizeSearchText('  Óscar Cárdenas ')).toBe('oscar cardenas');
    expect(normalizeSearchText('Iván Güell')).toBe('ivan guell');
    expect(normalizeSearchText('Peña')).toBe('pena');
    expect(normalizeSearchText('OPERACIÓN SEGURA')).toBe('operacion segura');
  });

  it('no cambia letras, números ni guiones', () => {
    expect(normalizeSearchText('N2-AYP-202')).toBe('n2-ayp-202');
  });
});

describe('matchesAllWords (BG-60)', () => {
  it('ignora tildes en el texto y en la consulta', () => {
    expect(matchesAllWords('Óscar Pardo', 'oscar')).toBe(true);
    expect(matchesAllWords('Oscar Pardo', 'óscar')).toBe(true);
    expect(matchesAllWords('Operación Segura', 'operacion')).toBe(true);
  });

  it('la ñ coincide con n y con ñ', () => {
    expect(matchesAllWords('Andrés Peña', 'pena')).toBe(true);
    expect(matchesAllWords('Andrés Peña', 'PEÑA')).toBe(true);
  });

  it('ignora mayúsculas', () => {
    expect(matchesAllWords('Iván Cárdenas', 'IVAN CARDENAS')).toBe(true);
  });

  it('cada palabra debe aparecer, en cualquier orden y como parte de una palabra', () => {
    expect(matchesAllWords('Óscar Pardo', 'par osc')).toBe(true);
    expect(matchesAllWords('Óscar Pardo', 'oscar gomez')).toBe(false);
    expect(matchesAllWords('Equipo N2-AYP-202', '202')).toBe(true);
  });

  it('una consulta vacía o de espacios coincide con todo', () => {
    expect(matchesAllWords('Óscar Pardo', '')).toBe(true);
    expect(matchesAllWords('Óscar Pardo', '   ')).toBe(true);
  });
});
