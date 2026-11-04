import {
  extractTeamLevel,
  findEvaluatorBlocker,
  hasNrcConflict,
  isSeniorEvaluator,
} from '../assignment-validation/assignment-rules';
import { buildPlan } from './automatic-assignment.coverage';
import {
  AutoAssignmentAlert,
  AutoAssignmentPlan,
  PlannedAssignment,
  PlannerInput,
  PlannerJuror,
  PlannerTeam,
} from './automatic-assignment.types';

/**
 * HU-07 (ARK-114): planificador de la asignación automática de jurados.
 * Función pura: recibe la foto de la edición y devuelve el plan, sin tocar la BD.
 *
 * Reglas:
 * - Cada grupo recibe hasta `jurorsPerTeam` (3) jurados.
 * - Cada jurado recibe hasta `maxTeamsPerJuror` (3, configurable) grupos, todos
 *   del mismo nivel.
 * - Lo que ya está asignado es fijo (P-21): no se quita y cuenta en la carga y
 *   en el nivel del jurado. Volver a ejecutar solo completa lo que falta.
 * - Remanentes: no llegan aquí (los excluye quien arma la foto).
 * - Colegios (N0): solo seniors (profesores o categoría SENIOR, P-07/P-08). Se
 *   usa `findEvaluatorBlocker` de HU-08, igual que la asignación manual.
 * - Conflicto de interés: nadie evalúa equipos de sus propios NRC, salvo N0.
 * - Cada equipo universitario recibe, si es posible, al menos un senior.
 *
 * Algoritmo:
 * 1. Foto: carga actual de cada jurado (grupos de la edición) y su nivel. Un
 *    jurado con grupos de varios niveles (asignación manual) o sin categoría
 *    queda fuera y se reporta.
 * 2. Reparto de niveles: a cada jurado sin grupos se le fija un nivel.
 *    a. Seniors a N0 hasta cubrir sus cupos (primero los que dictan más NRC,
 *       porque en N0 no tienen conflicto).
 *    b. Un senior por equipo universitario: seniors al nivel con más equipos sin
 *       senior.
 *    c. El resto, uno por uno, al nivel con más cupos sin cubrir. Esto también
 *       reparte a los jurados de sobra, así la carga queda equilibrada.
 * 3. Llenado por nivel (N0 primero):
 *    a. En universitarios, un senior a cada equipo que no tiene.
 *    b. Rondas: en cada ronda el equipo con menos jurados recibe uno, el jurado
 *       con menos carga que pueda tomarlo.
 * 4. Rescate: un jurado que quedó sin grupos (por conflictos de NRC) se prueba en
 *    los niveles que siguen incompletos.
 * 5. Cobertura y alertas: equipos incompletos, sin senior y colegios sin seniors.
 *
 * Determinista: con la misma foto devuelve el mismo plan (lo usa `confirm`).
 */

interface TeamState {
  team: PlannerTeam;
  level: number;
  jurorIds: Set<string>;
  hasSenior: boolean;
  nrcIds: Set<number>;
}

interface JurorState {
  juror: PlannerJuror;
  senior: boolean;
  load: number;
  level: number | null;
  /** true si el nivel viene de sus grupos fijos. */
  fixedLevel: boolean;
}

export function planAutomaticAssignment(
  input: PlannerInput,
): AutoAssignmentPlan {
  const { limits } = input;
  const alerts: AutoAssignmentAlert[] = [];
  const teams = buildTeamStates(input.teams, alerts);
  const jurors = buildJurorStates(input, alerts);
  const added: PlannedAssignment[] = [];

  const ctx: PlannerContext = { teams, jurors, limits, added };
  const levels = [...new Set(teams.map((t) => t.level))].sort((a, b) => a - b);

  allocateLevels(ctx, levels);
  for (const level of levels) fillLevel(ctx, level);
  rescueUnusedJurors(ctx, levels);

  return buildPlan({
    input,
    teams: teams.map((t) => ({ ...t, jurorIds: [...t.jurorIds] })),
    jurors: [...jurors.values()].map((j) => ({
      juror: j.juror,
      load: j.load,
      level: j.level,
    })),
    added,
    alerts,
  });
}

interface PlannerContext {
  teams: TeamState[];
  jurors: Map<string, JurorState>;
  limits: PlannerInput['limits'];
  added: PlannedAssignment[];
}

// ─── 1. Foto ─────────────────────────────────────────────────────────────────

function buildTeamStates(
  teams: PlannerTeam[],
  alerts: AutoAssignmentAlert[],
): TeamState[] {
  const states: TeamState[] = [];
  for (const team of [...teams].sort(byTeamCode)) {
    if (!team.assignable) continue;
    const level = extractTeamLevel(team.teamCode);
    if (level === null) {
      alerts.push({
        code: 'UNREADABLE_TEAM_LEVEL',
        message: `El grupo ${team.teamCode} (${team.teamName}) no tiene un código con nivel (N<número>-...) y no recibe jurados.`,
        teamId: team.id,
      });
      continue;
    }
    states.push({
      team,
      level,
      jurorIds: new Set(team.assigned.map((e) => e.id)),
      hasSenior: team.assigned.some(isSeniorEvaluator),
      nrcIds: new Set(team.memberNrcIds),
    });
  }
  return states;
}

function buildJurorStates(
  input: PlannerInput,
  alerts: AutoAssignmentAlert[],
): Map<string, JurorState> {
  const loads = new Map<string, number>();
  const levelsByJuror = new Map<string, Set<number>>();
  for (const team of input.teams) {
    const level = extractTeamLevel(team.teamCode);
    for (const { id } of team.assigned) {
      loads.set(id, (loads.get(id) ?? 0) + 1);
      if (level === null) continue;
      const set = levelsByJuror.get(id) ?? new Set<number>();
      set.add(level);
      levelsByJuror.set(id, set);
    }
  }

  const states = new Map<string, JurorState>();
  for (const juror of [...input.jurors].sort(byName)) {
    if (juror.kind === 'JUROR' && !juror.jurorCategory) {
      alerts.push({
        code: 'JUROR_MISSING_CATEGORY',
        message: `El jurado ${juror.name} no tiene categoría (JUNIOR/SENIOR) y no recibe grupos. Corrígelo en Personal → Jurados.`,
        jurorId: juror.id,
      });
      continue;
    }
    const levels = [...(levelsByJuror.get(juror.id) ?? [])].sort(
      (a, b) => a - b,
    );
    if (levels.length > 1) {
      alerts.push({
        code: 'JUROR_FIXED_MIXED_LEVELS',
        message: `${juror.name} ya tiene grupos de varios niveles (${levels.map((l) => `N${l}`).join(', ')}) por asignación manual; la automática no le agrega más.`,
        jurorId: juror.id,
      });
      continue;
    }
    states.set(juror.id, {
      juror,
      senior: isSeniorEvaluator(juror),
      load: loads.get(juror.id) ?? 0,
      level: levels[0] ?? null,
      fixedLevel: levels.length === 1,
    });
  }
  return states;
}

// ─── 2. Reparto de niveles ───────────────────────────────────────────────────

function allocateLevels(ctx: PlannerContext, levels: number[]): void {
  const capacity = (j: JurorState) =>
    Math.max(0, ctx.limits.maxTeamsPerJuror - j.load);
  const jurorsIn = (level: number) =>
    [...ctx.jurors.values()].filter((j) => j.level === level);

  const residual = new Map<number, number>();
  const seniorResidual = new Map<number, number>();
  for (const level of levels) {
    const teams = ctx.teams.filter((t) => t.level === level);
    const open = teams.reduce((sum, t) => sum + missingSlots(ctx, t), 0);
    const usable = jurorsIn(level)
      .filter((j) => level !== 0 || j.senior)
      .reduce((sum, j) => sum + capacity(j), 0);
    residual.set(level, open - usable);

    if (level !== 0) {
      const withoutSenior = teams.filter(
        (t) => !t.hasSenior && missingSlots(ctx, t) > 0,
      ).length;
      const seniorCapacity = jurorsIn(level)
        .filter((j) => j.senior)
        .reduce((sum, j) => sum + capacity(j), 0);
      seniorResidual.set(level, withoutSenior - seniorCapacity);
    }
  }

  const free = [...ctx.jurors.values()].filter(
    (j) => j.level === null && capacity(j) > 0,
  );
  const take = (j: JurorState, level: number) => {
    j.level = level;
    free.splice(free.indexOf(j), 1);
    residual.set(level, residual.get(level)! - capacity(j));
    if (j.senior && seniorResidual.has(level)) {
      seniorResidual.set(level, seniorResidual.get(level)! - capacity(j));
    }
  };

  // a. Colegios: seniors que dictan más NRC primero (en N0 no hay conflicto).
  if (residual.has(0)) {
    const seniors = free
      .filter((j) => j.senior)
      .sort(
        (a, b) =>
          b.juror.managedNrcIds.length - a.juror.managedNrcIds.length ||
          byName(a.juror, b.juror),
      );
    for (const senior of seniors) {
      if (residual.get(0)! <= 0) break;
      take(senior, 0);
    }
  }

  // b. Un senior por equipo universitario.
  for (;;) {
    const level = maxPositive(seniorResidual);
    const senior = free
      .filter((j) => j.senior)
      .sort(
        (a, b) =>
          a.juror.managedNrcIds.length - b.juror.managedNrcIds.length ||
          byName(a.juror, b.juror),
      )[0];
    if (level === null || !senior) break;
    take(senior, level);
  }

  // c. El resto, al nivel con más cupos sin cubrir (también los de sobra).
  const university = new Map([...residual].filter(([level]) => level !== 0));
  for (const juror of [...free]) {
    const level = maxEntry(university);
    if (level === null) break;
    take(juror, level);
    university.set(level, residual.get(level)!);
  }
}

// ─── 3. Llenado por nivel ────────────────────────────────────────────────────

function fillLevel(ctx: PlannerContext, level: number): void {
  const teams = ctx.teams.filter((t) => t.level === level);

  if (level !== 0) {
    for (const team of teams) {
      if (team.hasSenior || missingSlots(ctx, team) <= 0) continue;
      const senior = pickJuror(ctx, team, (j) => j.senior);
      if (senior) assign(ctx, team, senior);
    }
  }

  for (;;) {
    const open = teams
      .filter((t) => missingSlots(ctx, t) > 0)
      .sort((a, b) => a.jurorIds.size - b.jurorIds.size || byState(a, b));
    let progress = false;
    for (const team of open) {
      const juror = pickJuror(ctx, team);
      if (!juror) continue;
      assign(ctx, team, juror);
      progress = true;
    }
    if (!progress) return;
  }
}

/** El jurado con menos carga que puede tomar el equipo (desempate por nombre). */
function pickJuror(
  ctx: PlannerContext,
  team: TeamState,
  extra: (j: JurorState) => boolean = () => true,
): JurorState | null {
  let best: JurorState | null = null;
  for (const juror of ctx.jurors.values()) {
    if (!extra(juror) || !canTake(ctx, juror, team)) continue;
    if (
      !best ||
      juror.load < best.load ||
      (juror.load === best.load && byName(juror.juror, best.juror) < 0)
    ) {
      best = juror;
    }
  }
  return best;
}

function canTake(
  ctx: PlannerContext,
  juror: JurorState,
  team: TeamState,
): boolean {
  return (
    juror.level === team.level &&
    juror.load < ctx.limits.maxTeamsPerJuror &&
    !team.jurorIds.has(juror.juror.id) &&
    findEvaluatorBlocker(juror.juror, team.team) === null &&
    !hasNrcConflict(team.level, juror.juror.managedNrcIds, team.nrcIds)
  );
}

function assign(ctx: PlannerContext, team: TeamState, juror: JurorState) {
  team.jurorIds.add(juror.juror.id);
  team.hasSenior ||= juror.senior;
  juror.load += 1;
  ctx.added.push({ teamId: team.team.id, jurorId: juror.juror.id });
}

// ─── 4. Rescate ──────────────────────────────────────────────────────────────

function rescueUnusedJurors(ctx: PlannerContext, levels: number[]): void {
  const used = new Set(ctx.added.map((a) => a.jurorId));
  const unused = [...ctx.jurors.values()].filter(
    (j) => !j.fixedLevel && j.load === 0 && !used.has(j.juror.id),
  );
  for (const juror of unused) {
    const pending = levels
      .map((level) => ({
        level,
        missing: ctx.teams
          .filter((t) => t.level === level)
          .reduce((sum, t) => sum + missingSlots(ctx, t), 0),
      }))
      .filter((l) => l.missing > 0 && l.level !== juror.level)
      .sort((a, b) => b.missing - a.missing || a.level - b.level);

    const original = juror.level;
    for (const { level } of pending) {
      juror.level = level;
      fillLevel(ctx, level);
      if (juror.load > 0) break;
      juror.level = original;
    }
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function missingSlots(ctx: PlannerContext, team: TeamState): number {
  return Math.max(0, ctx.limits.jurorsPerTeam - team.jurorIds.size);
}

function maxPositive(map: Map<number, number>): number | null {
  const level = maxEntry(map);
  return level !== null && map.get(level)! > 0 ? level : null;
}

/** Nivel con el valor más alto (desempate: el nivel más bajo). */
function maxEntry(map: Map<number, number>): number | null {
  let best: number | null = null;
  for (const [level, value] of map) {
    if (
      best === null ||
      value > map.get(best)! ||
      (value === map.get(best)! && level < best)
    ) {
      best = level;
    }
  }
  return best;
}

function byName(
  a: { name: string; id: string },
  b: { name: string; id: string },
): number {
  return a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);
}

function byTeamCode(a: PlannerTeam, b: PlannerTeam): number {
  return a.teamCode.localeCompare(b.teamCode, 'es') || a.id - b.id;
}

function byState(a: TeamState, b: TeamState): number {
  return byTeamCode(a.team, b.team);
}
