/**
 * HU-24 (ARK-217): qué grupos proponerle a un suplente junior. Lógica pura, sin base de datos;
 * HU-14 (contingencia con suplentes) puede reutilizar el cálculo de faltantes.
 *
 * Reglas (backlog, criterio «Asignar grupos automáticamente», y decisiones del 15-nov):
 * 1. Se excluyen los colegios (nivel 0) y los equipos sin nivel legible: el suplente es Junior.
 * 2. Cada grupo necesita `required` jurados (3, P-10). Faltantes = `required − contados`, mínimo 0.
 * 3. Se elige un solo nivel: el que suma más faltantes. Empate: el de más grupos con faltantes;
 *    si siguen empatados, el nivel más bajo.
 * 4. Dentro del nivel, primero los grupos a los que más jurados les faltan (empate: por código),
 *    hasta `maxTeams`. Si hay menos, se proponen solo esos: no se completa con otro nivel.
 * Quién cuenta (asignados o presentes, según la hora de control) lo decide quien llama.
 */
export interface ShortageTeamInput {
  id: number;
  teamCode: string;
  teamName: string;
  videogame: string | null;
  /** Nivel del código del equipo: 0 = colegios; null si no se puede leer. */
  level: number | null;
  /** Jurados que cuentan hoy para el grupo (asignados o presentes). */
  countedJurors: number;
}

export interface ShortageTeam {
  id: number;
  codigo: string;
  nombre: string;
  videojuego: string | null;
  juradosContados: number;
  faltantes: number;
}

export interface LevelShortage {
  level: number;
  faltantes: number;
  gruposConFaltantes: number;
}

export interface ShortagePlan {
  /** Nivel elegido; null si ningún grupo elegible tiene faltantes. */
  level: number | null;
  /** La propuesta: hasta `maxTeams` grupos, todos del nivel elegido. */
  teams: ShortageTeam[];
  /** Los demás grupos con faltantes del nivel elegido (para «Editar»). */
  otherTeamsOfLevel: ShortageTeam[];
  /** Resumen de todos los niveles con faltantes, del más bajo al más alto. */
  levels: LevelShortage[];
}

const toShortageTeam = (
  team: ShortageTeamInput,
  required: number,
): ShortageTeam => ({
  id: team.id,
  codigo: team.teamCode,
  nombre: team.teamName,
  videojuego: team.videogame,
  juradosContados: team.countedJurors,
  faltantes: Math.max(0, required - team.countedJurors),
});

const byNeed = (a: ShortageTeam, b: ShortageTeam) =>
  b.faltantes - a.faltantes ||
  a.codigo.localeCompare(b.codigo, 'es', { sensitivity: 'base' }) ||
  a.id - b.id;

export function planGroupShortage(
  teams: ShortageTeamInput[],
  options: { maxTeams: number; required: number },
): ShortagePlan {
  const byLevel = new Map<number, ShortageTeam[]>();
  for (const team of teams) {
    if (team.level === null || team.level < 1) continue;
    const shortage = toShortageTeam(team, options.required);
    if (shortage.faltantes === 0) continue;
    byLevel.set(team.level, [...(byLevel.get(team.level) ?? []), shortage]);
  }

  const levels: LevelShortage[] = [...byLevel.entries()]
    .map(([level, list]) => ({
      level,
      faltantes: list.reduce((sum, team) => sum + team.faltantes, 0),
      gruposConFaltantes: list.length,
    }))
    .sort((a, b) => a.level - b.level);

  const [chosen] = [...levels].sort(
    (a, b) =>
      b.faltantes - a.faltantes ||
      b.gruposConFaltantes - a.gruposConFaltantes ||
      a.level - b.level,
  );
  if (!chosen) {
    return { level: null, teams: [], otherTeamsOfLevel: [], levels };
  }

  const ordered = [...byLevel.get(chosen.level)!].sort(byNeed);
  return {
    level: chosen.level,
    teams: ordered.slice(0, options.maxTeams),
    otherTeamsOfLevel: ordered.slice(options.maxTeams),
    levels,
  };
}
