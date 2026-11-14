import { extractTeamLevel } from './assignment-rules';

/**
 * BG-39 (ARK-188): nivel de un equipo para las listas de la asignación manual. Sale de la misma
 * regla que usan las advertencias de HU-08 (`extractTeamLevel`), para que lo que ve el
 * administrador coincida con lo que valida el servidor.
 */
export interface TeamLevelInfo {
  teamCode: string;
  /** 0 = colegios; null si el código no trae nivel (`N<número>-...`). */
  nivel: number | null;
  /** «Nivel 1», «Colegios» o «Sin nivel». */
  nivelEtiqueta: string;
}

export function teamLevelLabel(level: number | null): string {
  if (level === null) return 'Sin nivel';
  if (level === 0) return 'Colegios';
  return `Nivel ${level}`;
}

export function teamLevelInfo(teamCode: string): TeamLevelInfo {
  const nivel = extractTeamLevel(teamCode);
  return { teamCode, nivel, nivelEtiqueta: teamLevelLabel(nivel) };
}

/** Por nivel (los que no tienen nivel al final) y luego por nombre, sin distinguir tildes. */
export function byLevelThenName(
  a: { nivel: number | null; nombre: string },
  b: { nivel: number | null; nombre: string },
): number {
  const levelA = a.nivel ?? Number.POSITIVE_INFINITY;
  const levelB = b.nivel ?? Number.POSITIVE_INFINITY;
  if (levelA !== levelB) return levelA - levelB;
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
}
