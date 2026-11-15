import { normalizeText } from 'src/jurors/juror-edition/juror-edition-list';

/**
 * HU-24 (ARK-217): ¿dos nombres pueden ser la misma persona? Lógica pura, sin base de datos.
 *
 * Se comparan las palabras del nombre completo sin tildes ni mayúsculas. Coinciden si son las
 * mismas o si todas las palabras del nombre más corto están en el más largo: «Ana Pérez» coincide
 * con «Ana María Pérez Gómez», pero no con «Ana Gómez». Sin distancia de edición: un error de
 * tecleo no se detecta (decisión del 15 de noviembre), y el correo repetido se revisa aparte.
 */
export interface PersonName {
  firstName: string | null;
  lastName: string | null;
}

/** Mínimo de palabras para comparar: con una sola («Ana») coincidiría media lista. */
const MIN_WORDS = 2;

/**
 * Palabras del nombre completo: sin tildes, en minúsculas y sin guiones ni apóstrofos. La ñ queda
 * como n («Peña» = «Pena»): es preferible avisar de más que dejar pasar un duplicado.
 */
export function nameWords(person: PersonName): string[] {
  return normalizeText(`${person.firstName ?? ''} ${person.lastName ?? ''}`)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function isSimilarName(a: PersonName, b: PersonName): boolean {
  const wordsA = [...new Set(nameWords(a))];
  const wordsB = [...new Set(nameWords(b))];
  const [shorter, longer] =
    wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  if (shorter.length < MIN_WORDS) return false;
  return shorter.every((word) => longer.includes(word));
}

/** Las personas de `people` cuyo nombre puede ser el de `candidate`, en el orden recibido. */
export function findSimilarPeople<T extends PersonName>(
  candidate: PersonName,
  people: T[],
): T[] {
  return people.filter((person) => isSimilarName(candidate, person));
}
