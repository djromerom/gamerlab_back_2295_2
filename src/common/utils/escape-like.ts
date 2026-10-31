/**
 * Escapa `%`, `_` y `\` para usar un texto literal en filtros `contains`/`equals` con
 * `mode: 'insensitive'` de Prisma, que en PostgreSQL se traducen a LIKE/ILIKE sin escapar
 * los comodines (F4). El escape por defecto de PostgreSQL es la barra invertida.
 */
export const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, '\\$&');
