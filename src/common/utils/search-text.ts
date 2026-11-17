/**
 * BG-60 (ARK-260): búsqueda que ignora mayúsculas y tildes («oscar» encuentra «Óscar»).
 * Se filtra en memoria porque Postgres con `mode: 'insensitive'` no ignora las tildes y no
 * usamos la extensión `unaccent`. Sirve para conjuntos pequeños (jurados de una edición,
 * juegos asignados a un jurado).
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Cada palabra de la consulta (normalizada) debe estar contenida en el texto (normalizado).
 * Una consulta vacía o solo con espacios coincide con todo.
 */
export function matchesAllWords(haystack: string, query: string): boolean {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = normalizeSearchText(haystack);
  return words.every((word) => text.includes(word));
}
