/**
 * Emula `value ILIKE pattern` de PostgreSQL (escape por defecto `\`): `%` es cualquier
 * cadena, `_` cualquier carácter y `\x` el carácter literal x. Así los fakes de Prisma
 * reproducen lo que hace `equals` + `mode: 'insensitive'` en la BD real, comodines incluidos,
 * en lugar de una igualdad exacta que ocultaría el problema.
 */
export function postgresIlike(value: string, pattern: string): boolean {
  let regex = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\' && i + 1 < pattern.length) {
      regex += escapeRegex(pattern[++i]);
    } else if (char === '%') {
      regex += '[\\s\\S]*';
    } else if (char === '_') {
      regex += '[\\s\\S]';
    } else {
      regex += escapeRegex(char);
    }
  }
  return new RegExp(`^${regex}$`, 'i').test(value);
}

const escapeRegex = (char: string) =>
  char.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Filtro `where.email` de Prisma sobre un usuario en memoria. */
export function matchesPrismaEmailFilter(
  email: string,
  filter: string | { equals?: string; mode?: string } | undefined,
): boolean {
  if (typeof filter === 'string') return email === filter;
  if (filter?.mode === 'insensitive')
    return postgresIlike(email, filter.equals ?? '');
  return email === filter?.equals;
}
