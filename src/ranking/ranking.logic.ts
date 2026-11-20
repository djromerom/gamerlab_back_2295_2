import { TieBreakMethod } from '@prisma/client';
import { hasLessThanMinEvaluations } from './min-evaluations';

/**
 * HU-04 (ARK-98): reglas del ranking oficial por nivel, sin acceso a la base.
 *
 * - El nivel sale del prefijo del código del equipo (`N{semestre}-...`, P-03).
 * - La nota ya viene redondeada a 2 decimales desde `vw_team_final_scores` (P-04).
 * - Empate = misma nota dentro del mismo nivel y edición.
 * - Desempate (HU-47, ARK-304; decisión del profesor del 19-nov que reemplaza P-05): siempre por
 *   fecha de inscripción, primero el grupo inscrito antes. Si la fecha coincide, decide el id del
 *   equipo (menor primero). Los profesores ya no eligen y las decisiones guardadas antes
 *   (`TieBreakDecision`) no cambian el orden: quedan solo como historial.
 */

export const DEFAULT_PODIUM_SIZE = 3;

/** Desde HU-47 todo empate se resuelve por inscripción. */
export type TieRule = 'REGISTRATION';
/** Desde HU-47 un empate nunca queda pendiente; se conserva el campo por compatibilidad. */
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
  level: number;
  score: number;
  /** Puestos que ocupan los grupos empatados dentro del nivel (desde, hasta). */
  positions: [number, number];
  affectsPodium: boolean;
  rule: TieRule;
  status: TieStatus;
  /** Siempre vacío desde HU-47 (nadie decide); se conserva por compatibilidad con el front. */
  deciders: PersonRef[];
  teams: TieTeam[];
  /** Orden aplicado: por fecha de inscripción y, si coincide, por id del equipo. */
  order: number[];
  /** Siempre null desde HU-47; el historial está en `GET /ranking/decisions`. */
  decision: DecisionRef | null;
  /** Motivo del orden aplicado, para mostrarlo tal cual. */
  explanation: string;
}

/** Parte de la nota que le falta a un equipo: la de profesores y seniors, o la de jurados junior. */
export type MissingScorePart = 'PROFESSOR' | 'JUROR';

export interface LevelRanking {
  level: number;
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

/** Identifica un empate: si cambia la nota o el conjunto de equipos, es otro empate. */
export function buildTieKey(
  editionId: number,
  level: number,
  score: number,
  teamIds: number[],
): string {
  const ids = [...teamIds].sort((a, b) => a - b).join(',');
  return `${editionId}:N${level}:${score.toFixed(2)}:${ids}`;
}

function byRegistration(a: TieTeam, b: TieTeam): number {
  const diff = Date.parse(a.registrationDate) - Date.parse(b.registrationDate);
  return diff !== 0 ? diff : a.teamId - b.teamId;
}

/** HU-47: todo empate se resuelve por inscripción; nadie decide. */
export function classifyTie(): { rule: TieRule; deciders: PersonRef[] } {
  return { rule: 'REGISTRATION', deciders: [] };
}

/** Orden de un empate: primero el inscrito antes; con la misma fecha, el id menor. */
export function registrationOrder(teams: TieTeam[]): number[] {
  return [...teams].sort(byRegistration).map((t) => t.teamId);
}

function hasRepeatedRegistration(teams: TieTeam[]): boolean {
  const times = teams.map((t) => Date.parse(t.registrationDate));
  return new Set(times).size !== times.length;
}

/** Texto del criterio de inscripción, con las fechas, para mostrarlo y registrarlo. */
export function registrationReason(teams: TieTeam[]): string {
  const ordered = [...teams].sort(byRegistration);
  const detail = ordered
    .map((t) => `${t.teamCode} (${t.registrationDate})`)
    .join(', ');
  const sameDate = hasRepeatedRegistration(teams)
    ? ' Hay grupos con la misma fecha de inscripción: entre ellos va primero el de id menor.'
    : '';
  return `Resuelto por fecha de inscripción: primero el grupo inscrito antes.${sameDate} Orden: ${detail}.`;
}

function resolveTie(
  teams: TieTeam[],
): Pick<
  TieGroup,
  'rule' | 'status' | 'deciders' | 'order' | 'decision' | 'explanation'
> {
  return {
    ...classifyTie(),
    status: 'RESOLVED',
    order: registrationOrder(teams),
    decision: null,
    explanation: registrationReason(teams),
  };
}

export interface BuildRankingInput {
  editionId: number;
  rows: ScoreRow[];
  teams: Map<number, TeamInfo>;
  podiumSize?: number;
}

/**
 * Arma el ranking oficial de cada nivel. Quedan fuera los equipos inactivos, los de otra
 * edición y los que no tienen código con nivel (ver `teamsWithoutLevel`); los que no tienen
 * ninguna nota se listan aparte.
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
    if (level === null) continue;
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
      return buildOneLevel(input, level, scored, unscored, podiumSize);
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
 * HU-34: un colegio (N0) solo cuenta a profesores y seniors; los demás cuentan ambas partes. La
 * casilla «Externo» no cambia qué partes cuentan (BG-69, ARK-272).
 */
function countedScoreParts(row: ScoreRow, level: number) {
  const isCollege = level === 0;
  return {
    professors: true,
    jurors: !isCollege,
  };
}

function missingScoreParts(row: ScoreRow, level: number): MissingScorePart[] {
  const counted = countedScoreParts(row, level);
  const missing: MissingScorePart[] = [];
  if (counted.professors && row.seniorEvaluations === 0)
    missing.push('PROFESSOR');
  if (counted.jurors && row.juniorEvaluations === 0) missing.push('JUROR');
  return missing;
}

function buildOneLevel(
  input: BuildRankingInput,
  level: number,
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
      const resolved = resolveTie(tieTeams);
      const from = position;
      const to = position + rows.length - 1;
      tie = {
        tieKey,
        editionId: input.editionId,
        level,
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
      const counted = countedScoreParts(row, level);
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
          counted.jurors && hasLessThanMinEvaluations(row),
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
    label: levelLabel(level),
    teams,
    podium: teams.filter((t) => t.podium),
    ties,
    withoutScore: unscored.map((r) => ({
      teamId: r.teamId,
      teamCode: r.teamCode ?? '',
      teamName: r.teamName,
      missing: missingScoreParts(r, level),
    })),
  };
}
