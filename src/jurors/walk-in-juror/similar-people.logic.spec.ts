import {
  findSimilarPeople,
  isSimilarName,
  nameWords,
} from './similar-people.logic';

const person = (firstName: string | null, lastName: string | null) => ({
  firstName,
  lastName,
});

describe('HU-24: nombres parecidos', () => {
  it('ignora tildes, mayúsculas, guiones y espacios de más', () => {
    expect(nameWords(person('  José  María', "PÉREZ-O'Neill"))).toEqual([
      'jose',
      'maria',
      'perez',
      'o',
      'neill',
    ]);
    expect(
      isSimilarName(person('JOSE', 'perez'), person('José', 'Pérez')),
    ).toBe(true);
  });

  it('trata la ñ como n: prefiere avisar de más', () => {
    expect(isSimilarName(person('Ana', 'Peña'), person('Ana', 'Pena'))).toBe(
      true,
    );
  });

  it('coincide cuando el nombre corto está completo dentro del largo', () => {
    const full = person('Ana María', 'Pérez Gómez');
    expect(isSimilarName(person('Ana', 'Pérez'), full)).toBe(true);
    expect(isSimilarName(full, person('Ana', 'Pérez'))).toBe(true);
    expect(isSimilarName(person('Pérez', 'Ana'), full)).toBe(true);
  });

  it('no coincide si alguna palabra del nombre corto no está en el largo', () => {
    expect(
      isSimilarName(person('Ana', 'Gómez'), person('Ana María', 'Pérez')),
    ).toBe(false);
    expect(isSimilarName(person('Ana', 'Pérez'), person('Luis', 'Pérez'))).toBe(
      false,
    );
  });

  it('no compara nombres de una sola palabra ni cuentas sin nombre', () => {
    expect(isSimilarName(person('Ana', ''), person('Ana', 'Pérez'))).toBe(
      false,
    );
    expect(isSimilarName(person('Ana', 'Ana'), person('Ana', 'Pérez'))).toBe(
      false,
    );
    expect(isSimilarName(person('Ana', 'Pérez'), person(null, null))).toBe(
      false,
    );
    expect(isSimilarName(person('', ''), person('', ''))).toBe(false);
  });

  it('findSimilarPeople devuelve solo las coincidencias, en el orden recibido', () => {
    const people = [
      { id: 'a', ...person('Luis', 'Díaz') },
      { id: 'b', ...person('Ana María', 'Pérez Gómez') },
      { id: 'c', ...person('ANA', 'PEREZ') },
      { id: 'd', ...person('', '') },
    ];
    expect(
      findSimilarPeople(person('Ana', 'Pérez'), people).map((p) => p.id),
    ).toEqual(['b', 'c']);
    expect(findSimilarPeople(person('Carla', 'Ruiz'), people)).toEqual([]);
  });
});
