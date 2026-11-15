import { TieBreakMethod } from '@prisma/client';

/**
 * HU-04 (ARK-98): reglas del ranking oficial por nivel, sin acceso a la base.
 *
 * - El nivel sale del prefijo del código del equipo (`N{semestre}-...`, P-03).
 * - La nota ya viene redondeada a 2 decimales desde `vw_team_final_scores` (P-04).
 * - Empate = misma nota dentro del mismo nivel y edición.
 * - Desempate (P-05):
 *   1. Todos los grupos empatados comparten un profesor (cualquier NRC suyo): decide ese profesor.
 *      Mientras no decida, el orden provisional es el de inscripción.
 *   2. Si no comparten profesor (o el empate mezcla grupos del mismo profesor con otros): primero
 *      el grupo inscrito antes.
 *   3. Si dos grupos tienen la misma fecha de inscripción no se puede aplicar el punto 2 y el empate
 *      queda para resolución manual del administrador.
 */

export const DEFAULT_PODIUM_SIZE = 3;
export const MIN_EVALUATIONS = 3;

export type TieRule = 'PROFESSOR' | 'REGISTRATION' | 'MANUAL';
export type TieStatus = 'PENDING' | 'RESOLVED';

export interface ScoreRow {
  teamId: number;
  teamCode: string | null;
  teamName: string | null;
  isExternal: boolean;
  videogameId: number;
  videogameName: string | null;
  videogameLogoUrl: string | null;
  editionId: number;
  avgJunior: number | null;
  avgSenior: number | null;
  finalScore: number | null;
  juniorEvaluations: number;
  juniorCounted: number;
  seniorEvaluations: number;
  weightingConfigured: boolean;
}

export interface PersonRef {
  id: string;
  name: string;
}

export interface TeamInfo {
  registrationDate: Date;
  isActive: boolean;
  professors: PersonRef[];
}

export interface DecisionRef {
  id: number;
  tieKey: string;
  method: TieBreakMethod;
  reason: string;
  orderedTeamIds: number[];
  decidedBy: PersonRef;
  decidedAt: Date;
}

export interface RankedTeam {
  position: number;
  teamId: number;
  teamCode: string;
  teamName: string | null;
  isExternal: boolean;
  videogameId: number;
  videogameName: string | null;
  logoUrl: string | null;
  finalScore: number;
  avgJunior: number | null;
  avgSenior: number | null;
  juniorEvaluations: number;
  juniorCounted: number;
  /** Evaluaciones de jurado guardadas que no entran al promedio (después de las 3 primeras). */
  juniorNotCounted: number;
  seniorEvaluations: number;
  /** Menos de 3 evaluaciones de jurado: el grupo sigue siendo válido, pero se marca. */
  lessThanMinEvaluations: boolean;
  missingProfessorScore: boolean;
  registrationDate: string;
  podium: boolean;
  tieKey: string | null;
  /** El puesto depende de un empate que aún no se resolvió. */
  provisional: boolean;
}

export interface TieTeam {
  teamId: number;
  teamCode: string;
  teamName: string | null;
  videogameName: string | null;
  registrationDate: string;
  professors: PersonRef[];
}

export interface TieGroup {
  tieKey: string;
  editionId: number;
  /** Null en el grupo Externos (HU-38), que mezcla equipos de varios niveles. */
  level: number | null;
  /** HU-38: empate dentro del grupo Externos. */
  external: boolean;
  score: number;
  /** Puestos que ocupan los grupos empatados dentro del nivel (desde, hasta). */
  positions: [number, number];
  affectsPodium: boolean;
  rule: TieRule;
  status: TieStatus;
  /** Profesores que pueden elegir (regla PROFESSOR). */
  deciders: PersonRef[];
  teams: TieTeam[];
  /** Orden aplicado (provisional mientras status = PENDING). */
  order: number[];
  decision: DecisionRef | null;
  /** Motivo del orden aplicado, para mostrarlo tal cual. */
  explanation: string;
}

/** Parte de la nota que le falta a un equipo: la de profesores y seniors, o la de jurados junior. */
export type MissingScorePart = 'PROFESSOR' | 'JUROR';

export interface LevelRanking {
  /** Null en el grupo Externos (HU-38). */
  level: number | null;
  /** HU-38: el grupo Externos, con su propio podio. */
  external: boolean;
  label: string;
  teams: RankedTeam[];
  podium: RankedTeam[];
  ties: TieGroup[];
  /**
   * Equipos del nivel en «Nota en proceso» (no entran al ranking). `missing` dice qué parte falta,
   * según lo que cuenta en su nota; es la lista de incompletos del panel y de HU-20.
   */
  withoutScore: {
    teamId: number;
    teamCode: string;
    teamName: string | null;
    missing: MissingScorePart[];
  }[];
}

/** `N2-ABC-201` → 2. Null si el código no sigue el formato. */
export function parseLevel(teamCode: string | null | undefined): number | null {
  const match = /^N(\d+)-/i.exec((teamCode ?? '').trim());
  return match ? Number(match[1]) : null;
}

export function levelLabel(level: number): string {
  return `N${level}`;
}

export const EXTERNAL_GROUP_LABEL = 'Externos'; // HU-38 (ARK-219)

/** HU-38: un externo compite en el grupo Externos; un colegio (N0) sigue en su nivel. */
export function inExternalGroup(
  row: Pick<ScoreRow, 'isExternal'>,
  level: number,
): boolean {
  return row.isExternal && level !== 0;
}

/** Identifica un empate (otra nota u otros equipos = otro empate). `level` null = Externos. */
export function buildTieKey(
  editionId: number,
  level: number | null,
  score: number,
  teamIds: number[],
): string {
  const ids = [...teamIds].sort((a, b) => a - b).join(',');
  const scope = level === null ? 'EXT' : `N${level}`;
  return `${editionId}:${scope}:${score.toFixed(2)}:${ids}`;
}

/** Profesores comunes a todos los equipos (intersección por id). */
export function commonProfessors(
  teams: { professors: PersonRef[] }[],
): PersonRef[] {
  if (teams.length === 0) return [];
  const [first, ...rest] = teams;
  return first.professors.filter((p) =>
    rest.every((t) => t.professors.some((q) => q.id === p.id)),
  );
}

function byRegistration(a: TieTeam, b: TieTeam): number {
  const diff = Date.parse(a.registrationDate) - Date.parse(b.registrationDate);
  return diff !== 0 ? diff : a.teamId - b.teamId;
}

function hasRepeatedRegistration(teams: TieTeam[]): boolean {
  const seen = new Set<number>();
  for (const t of teams) {
    const time = Date.parse(t.registrationDate);
    if (seen.has(time)) return true;
    seen.add(time);
  }
  return false;
}

export function classifyTie(teams: TieTeam[]): {
  rule: TieRule;
  deciders: PersonRef[];
} {
  const deciders = commonProfessors(teams);
  if (deciders.length > 0) return { rule: 'PROFESSOR', deciders };
  if (hasRepeatedRegistration(teams)) return { rule: 'MANUAL', deciders: [] };
  return { rule: 'REGISTRATION', deciders: [] };
}

/** Texto del criterio de inscripción, con las fechas, para registrar el motivo. */
export function registrationReason(teams: TieTeam[]): string {
  const ordered = [...teams].sort(byRegistration);
  const detail = ordered
    .map((t) => `${t.teamCode} (${t.registrationDate})`)
    .join(', ');
  return `Criterio de inscripción: primero el grupo inscrito antes. Orden: ${detail}.`;
}

function resolveTie(
  teams: TieTeam[],
  decision: DecisionRef | undefined,
): Pick<
  TieGroup,
  'rule' | 'status' | 'deciders' | 'order' | 'decision' | 'explanation'
> {
  const { rule, deciders } = classifyTie(teams);
  const registrationOrder = [...teams]
    .sort(byRegistration)
    .map((t) => t.teamId);

  if (decision) {
    return {
      rule,
      deciders,
      status: 'RESOLVED',
      order: decision.orderedTeamIds,
      decision,
      explanation: decision.reason,
    };
  }
  if (rule === 'REGISTRATION') {
    return {
      rule,
      deciders,
      status: 'RESOLVED',
      order: registrationOrder,
      decision: null,
      explanation: registrationReason(teams),
    };
  }
  if (rule === 'PROFESSOR') {
    return {
      rule,
      deciders,
      status: 'PENDING',
      order: registrationOrder,
      decision: null,
      explanation: `Pendiente: decide ${deciders.map((d) => d.name).join(' o ')}. Mientras tanto se muestra el orden de inscripción.`,
    };
  }
  return {
    rule,
    deciders,
    status: 'PENDING',
    order: [...teams].sort((a, b) => a.teamId - b.teamId).map((t) => t.teamId),
    decision: null,
    explanation:
      'Pendiente: hay grupos con la misma fecha de inscripción; lo resuelve el administrador.',
  };
}

export interface BuildRankingInput {
  editionId: number;
  rows: ScoreRow[];
  teams: Map<number, TeamInfo>;
  decisions: Map<string, DecisionRef>;
  podiumSize?: number;
}

/**
 * Arma el ranking oficial de cada nivel. Quedan fuera los equipos inactivos, los de otra
 * edición, los que no tienen código con nivel (ver `teamsWithoutLevel`) y los externos, que
 * tienen su propio grupo (HU-38, `external-ranking.logic.ts`); los que no tienen ninguna nota
 * se listan aparte.
 */
export function buildLevelRankings(input: BuildRankingInput): LevelRanking[] {
  const podiumSize = input.podiumSize ?? DEFAULT_PODIUM_SIZE;
  const byLevel = new Map<
    number,
    { scored: ScoreRow[]; unscored: ScoreRow[] }
  >();

  for (const row of input.rows) {
    if (row.editionId !== input.editionId) continue;
    const info = input.teams.get(row.teamId);
    if (!info || !info.isActive) continue;
    const level = parseLevel(row.teamCode);
    if (level === null || inExternalGroup(row, level)) continue;
    const bucket = byLevel.get(level) ?? { scored: [], unscored: [] };
    if (row.finalScore === null || row.finalScore === undefined)
      bucket.unscored.push(row);
    else bucket.scored.push(row);
    byLevel.set(level, bucket);
  }

  return [...byLevel.keys()]
    .sort((a, b) => a - b)
    .map((level) => {
      const { scored, unscored } = byLevel.get(level)!;
      return buildGroupRanking(input, level, scored, unscored, podiumSize);
    });
}

/**
 * Equipos activos de la edición cuyo código no sigue `N{n}-...`. No entran a ningún nivel, así que
 * se devuelven aparte para que no desaparezcan del ranking sin aviso.
 */
export function teamsWithoutLevel(
  input: Pick<BuildRankingInput, 'editionId' | 'rows' | 'teams'>,
): { teamId: number; teamCode: string; teamName: string | null }[] {
  return input.rows
    .filter(
      (row) =>
        row.editionId === input.editionId &&
        input.teams.get(row.teamId)?.isActive === true &&
        parseLevel(row.teamCode) === null,
    )
    .map((row) => ({
      teamId: row.teamId,
      teamCode: row.teamCode ?? '',
      teamName: row.teamName,
    }))
    .sort((a, b) => a.teamId - b.teamId);
}

function toTieTeam(row: ScoreRow, info: TeamInfo): TieTeam {
  return {
    teamId: row.teamId,
    teamCode: row.teamCode ?? '',
    teamName: row.teamName,
    videogameName: row.videogameName,
    registrationDate: info.registrationDate.toISOString(),
    professors: info.professors,
  };
}

/**
 * HU-34: un colegio (N0) solo cuenta a profesores y seniors, con o sin marca de externo; un externo
 * solo cuenta a los jurados junior; los demás cuentan ambas partes.
 */
function countedScoreParts(row: ScoreRow, level: number) {
  const isCollege = level === 0;
  return {
    professors: isCollege || !row.isExternal,
    jurors: !isCollege,
  };
}

/** Nivel del propio equipo (en el grupo Externos los niveles se mezclan). */
const rowLevel = (row: ScoreRow): number => parseLevel(row.teamCode) ?? -1;

function missingScoreParts(row: ScoreRow): MissingScorePart[] {
  const counted = countedScoreParts(row, rowLevel(row));
  const missing: MissingScorePart[] = [];
  if (counted.professors && row.seniorEvaluations === 0)
    missing.push('PROFESSOR');
  if (counted.jurors && row.juniorEvaluations === 0) missing.push('JUROR');
  return missing;
}

/** Ranking de un grupo: un nivel o, con `level` null, el grupo Externos (HU-38). */
export function buildGroupRanking(
  input: BuildRankingInput,
  level: number | null,
  scored: ScoreRow[],
  unscored: ScoreRow[],
  podiumSize: number,
): LevelRanking {
  // Grupos por nota (ya viene con 2 decimales), de mayor a menor.
  const groups = new Map<number, ScoreRow[]>();
  for (const row of scored) {
    const score = Number(row.finalScore!.toFixed(2));
    groups.set(score, [...(groups.get(score) ?? []), row]);
  }
  const scores = [...groups.keys()].sort((a, b) => b - a);

  const teams: RankedTeam[] = [];
  const ties: TieGroup[] = [];
  let position = 1;

  for (const score of scores) {
    const rows = groups.get(score)!;
    let ordered = rows;
    let tie: TieGroup | null = null;

    if (rows.length > 1) {
      const tieTeams = rows.map((r) =>
        toTieTeam(r, input.teams.get(r.teamId)!),
      );
      const tieKey = buildTieKey(
        input.editionId,
        level,
        score,
        rows.map((r) => r.teamId),
      );
      const resolved = resolveTie(tieTeams, input.decisions.get(tieKey));
      const from = position;
      const to = position + rows.length - 1;
      tie = {
        tieKey,
        editionId: input.editionId,
        level,
        external: level === null,
        score,
        positions: [from, to],
        affectsPodium: from <= podiumSize,
        teams: tieTeams,
        ...resolved,
      };
      ties.push(tie);
      const index = new Map(resolved.order.map((id, i) => [id, i]));
      ordered = [...rows].sort(
        (a, b) => (index.get(a.teamId) ?? 0) - (index.get(b.teamId) ?? 0),
      );
    }

    for (const row of ordered) {
      const info = input.teams.get(row.teamId)!;
      const counted = countedScoreParts(row, rowLevel(row));
      teams.push({
        position,
        teamId: row.teamId,
        teamCode: row.teamCode ?? '',
        teamName: row.teamName,
        isExternal: row.isExternal,
        videogameId: row.videogameId,
        videogameName: row.videogameName,
        logoUrl: row.videogameLogoUrl,
        finalScore: score,
        avgJunior: row.avgJunior,
        avgSenior: row.avgSenior,
        juniorEvaluations: row.juniorEvaluations,
        juniorCounted: row.juniorCounted,
        juniorNotCounted: Math.max(
          0,
          row.juniorEvaluations - row.juniorCounted,
        ),
        seniorEvaluations: row.seniorEvaluations,
        lessThanMinEvaluations:
          counted.jurors && row.juniorEvaluations < MIN_EVALUATIONS,
        missingProfessorScore:
          counted.professors && row.seniorEvaluations === 0,
        registrationDate: info.registrationDate.toISOString(),
        podium: position <= podiumSize,
        tieKey: tie?.tieKey ?? null,
        provisional: tie?.status === 'PENDING',
      });
      position++;
    }
  }

  return {
    level,
    external: level === null,
    label: level === null ? EXTERNAL_GROUP_LABEL : levelLabel(level),
    teams,
    podium: teams.filter((t) => t.podium),
    ties,
    withoutScore: unscored.map((r) => ({
      teamId: r.teamId,
      teamCode: r.teamCode ?? '',
      teamName: r.teamName,
      missing: missingScoreParts(r),
    })),
  };
}

/**
 * Valida el orden que envía quien decide: debe ser exactamente el conjunto de equipos empatados.
 * Devuelve un mensaje de error o null.
 */
export function validateOrder(
  tie: TieGroup,
  orderedTeamIds: number[],
): string | null {
  const expected = tie.teams.map((t) => t.teamId).sort((a, b) => a - b);
  const given = [...orderedTeamIds].sort((a, b) => a - b);
  if (
    given.length !== expected.length ||
    given.some((id, i) => id !== expected[i])
  ) {
    return `El orden debe incluir una sola vez cada equipo empatado: ${expected.join(', ')}.`;
  }
  return null;
}
