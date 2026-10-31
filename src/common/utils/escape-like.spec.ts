import { escapeLike } from './escape-like';

describe('escapeLike (F4)', () => {
  it('escapa porcentaje, guion bajo y barra invertida para que no actúen como comodines de LIKE/ILIKE', () => {
    expect(escapeLike('%')).toBe('\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('100%_\\')).toBe('100\\%\\_\\\\');
  });

  it('no altera texto sin comodines', () => {
    expect(escapeLike('Stella 2025')).toBe('Stella 2025');
  });
});
