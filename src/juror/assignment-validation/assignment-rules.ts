import { JurorCategory } from '@prisma/client';

import {
  AssignmentBlocker,
  AssignmentChange,
  AssignmentLimits,
  AssignmentRulesInput,
  AssignmentValidationResult,
  AssignmentWarning,
  AssignmentWarningContext,
  DEFAULT_ASSIGNMENT_LIMITS,
  RuleEvaluator,
  RuleNrc,
  RuleTeam,
} from './assignment-rules.types';

/**
 * HU-08 (ARK-102): reglas de coherencia de las asignaciones de jurados.
 *
 * Funciones puras (sin base de datos) para que las reutilicen la asignación
 * manual, la automática (HU-07), los suplentes (HU-09) y la contingencia (HU-14).
 * - Bloqueos: integridad, colegios (P-08) y edición activa (ARK-131: el equipo es de la
 *   edición activa y el evaluador participa en ella). No se pueden saltar.
 * - Advertencias: reglas de negocio que el administrador puede aceptar.
 */

/** Nivel del equipo a partir del código `N<número>-...` (N0 = colegios). */
export function extractTeamLevel(teamCode?: string | null): number | null {
  const match = teamCode?.match(/^N(\d+)/i);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

export function evaluatorLabel(evaluator: RuleEvaluator): string {
  if (evaluator.kind === 'PROFESSOR') return 'profesor';
  if (evaluator.kind === 'JUROR') {
    return evaluator.jurorCategory
      ? `jurado ${evaluator.jurorCategory.toLowerCase()}`
      : 'jurado';
  }
  return 'evaluador';
}

const subjectOf = (evaluator: RuleEvaluator) =>
  `El ${evaluatorLabel(evaluator)} ${evaluator.name}`.trim();

const levelLabel = (level: number) => `N${level}`;

// ─── Bloqueos ────────────────────────────────────────────────────────────────

/** Bloqueos de agregar un evaluador a un equipo (sin contar duplicados). */
export function findEvaluatorBlocker(
  evaluator: RuleEvaluator,
  team: Pick<RuleTeam, 'id' | 'teamCode'>,
): AssignmentBlocker | null {
  const base = { jurorId: evaluator.id, teamId: team.id };

  if (evaluator.kind === 'OTHER') {
    return {
      ...base,
      code: 'INVALID_EVALUATOR_ROLE',
      message: 'El usuario debe ser un jurado o un profesor.',
    };
  }

  const level = extractTeamLevel(team.teamCode);
  if (level === null) {
    return {
      ...base,
      code: 'UNREADABLE_TEAM_LEVEL',
      message:
        'No se pudo determinar el nivel del equipo. El código debe tener formato N<número>-..., por ejemplo N0-COLEGIOS-01 o N1-AYP-06.',
    };
  }

  // El profesor no tiene categoría propia: cuenta como senior (P-07).
  if (evaluator.kind === 'PROFESSOR') return null;

  if (!evaluator.jurorCategory) {
    return {
      ...base,
      code: 'MISSING_JUROR_CATEGORY',
      message: 'El jurado no tiene categoría asignada (JUNIOR/SENIOR).',
    };
  }

  if (level === 0 && evaluator.jurorCategory !== JurorCategory.SENIOR) {
    return {
      ...base,
      code: 'SCHOOL_REQUIRES_SENIOR',
      message:
        'Los jurados JUNIOR no pueden ser asignados a colegios (nivel 0). Los colegios solo los califican jurados senior (profesores).',
    };
  }

  return null;
}

/**
 * ARK-131 (BG-18): asignar, reasignar y quitar solo sobre equipos de la edición activa. Las
 * ediciones anteriores son historial (HU-27); el mensaje es el mismo de `EDITION_READ_ONLY`.
 */
export function findTeamEditionBlocker(
  team: Pick<RuleTeam, 'id' | 'teamCode' | 'editionId' | 'editionTitle'>,
  activeEdition: { id: number } | undefined,
): AssignmentBlocker | null {
  if (!activeEdition || team.editionId === activeEdition.id) return null;
  const edition = team.editionTitle
    ? `«${team.editionTitle}»`
    : 'una edición anterior';
  return {
    code: 'TEAM_NOT_IN_ACTIVE_EDITION',
    message:
      `No se pueden modificar los jurados del equipo ${team.teamCode}: pertenece a ${edition}, ` +
      'que no es la edición activa. Las ediciones anteriores son de solo lectura.',
    teamId: team.id,
  };
}

/**
 * ARK-131 (BG-18): solo se agrega a quien participa en la edición activa (HU-25,
 * `jurorsOfEdition`): jurado externo confirmado en la edición o profesor con un NRC activo
 * en ella. Quitar no lo exige: un jurado que dejó de participar se debe poder retirar.
 */
export function findEvaluatorEditionBlocker(
  evaluator: RuleEvaluator,
  team: Pick<RuleTeam, 'id'>,
  activeEdition: { title: string | null } | undefined,
): AssignmentBlocker | null {
  if (evaluator.participatesInActiveEdition !== false) return null;
  const edition = activeEdition?.title
    ? `«${activeEdition.title}»`
    : 'la edición activa';
  const requirement =
    evaluator.kind === 'PROFESSOR'
      ? 'un profesor participa cuando tiene al menos un NRC activo en la edición'
      : 'el jurado debe estar confirmado en Jurados de la edición';
  return {
    code: 'EVALUATOR_NOT_IN_EDITION',
    message: `${subjectOf(evaluator)} no participa en ${edition}: ${requirement}.`,
    jurorId: evaluator.id,
    teamId: team.id,
  };
}

/**
 * Aplica los cambios en orden sobre el estado de los equipos y devuelve los
 * bloqueos. Una reasignación es `REMOVE` del actual seguido de `ADD` del nuevo.
 */
export function findBlockers(input: AssignmentRulesInput): AssignmentBlocker[] {
  const { teamsById, evaluatorsById } = indexInput(input);
  const jurorsByTeam = initialJurorsByTeam(input.teams);
  const blockers: AssignmentBlocker[] = [];
  const teamsOutOfEdition = new Set<number>();

  for (const change of input.changes) {
    const team = getOrThrow(teamsById, change.teamId, 'equipo');
    const jurors = jurorsByTeam.get(team.id)!;

    const editionBlocker = findTeamEditionBlocker(team, input.activeEdition);
    if (editionBlocker) {
      // Un bloqueo por equipo aunque haya varios cambios (reasignar = quitar + agregar)
      if (!teamsOutOfEdition.has(team.id)) blockers.push(editionBlocker);
      teamsOutOfEdition.add(team.id);
      continue;
    }

    if (change.type === 'REMOVE') {
      jurors.delete(change.jurorId);
      continue;
    }

    const evaluator = getOrThrow(evaluatorsById, change.jurorId, 'evaluador');
    const blocker =
      findEvaluatorBlocker(evaluator, team) ??
      findEvaluatorEditionBlocker(evaluator, team, input.activeEdition);
    if (blocker) {
      blockers.push(blocker);
      continue;
    }

    if (jurors.has(evaluator.id)) {
      blockers.push({
        code: 'DUPLICATE_ASSIGNMENT',
        message: 'El evaluador ya está asignado a este equipo.',
        jurorId: evaluator.id,
        teamId: team.id,
      });
      continue;
    }

    jurors.add(evaluator.id);
  }

  return blockers;
}

// ─── Advertencias ────────────────────────────────────────────────────────────

/**
 * Advertencias del estado final tras aplicar los cambios.
 * - Grupo con menos del mínimo de jurados: solo si el cambio lo reduce (al
 *   llenar un grupo vacío no se advierte en cada paso). Más del mínimo es válido.
 * - Jurado con más grupos que el máximo o de varios niveles: se cuenta solo en
 *   la edición del equipo al que se agrega.
 * - Conflicto de interés por NRC, salvo colegios (igual que la automática).
 */
export function findWarnings(
  input: AssignmentRulesInput,
  context: AssignmentWarningContext,
): AssignmentWarning[] {
  const limits: AssignmentLimits = {
    ...DEFAULT_ASSIGNMENT_LIMITS,
    ...input.limits,
  };
  const { teamsById, evaluatorsById } = indexInput(input);

  return [
    ...teamUnderMinWarnings(input, teamsById, limits),
    ...jurorLoadWarnings(input, teamsById, evaluatorsById, context, limits),
    ...nrcConflictWarnings(input, teamsById, evaluatorsById, context),
  ];
}

function teamUnderMinWarnings(
  input: AssignmentRulesInput,
  teamsById: Map<number, RuleTeam>,
  limits: AssignmentLimits,
): AssignmentWarning[] {
  const jurorsByTeam = initialJurorsByTeam(input.teams);
  applyChanges(input.changes, jurorsByTeam);

  const warnings: AssignmentWarning[] = [];
  for (const [teamId, jurors] of jurorsByTeam) {
    const team = teamsById.get(teamId)!;
    const before = new Set(team.jurorIds).size;
    const after = jurors.size;

    if (after < limits.minJurorsPerTeam && after < before) {
      warnings.push({
        code: 'TEAM_UNDER_MIN',
        message: `El grupo ${team.teamCode} quedaría con ${after} jurado(s); cada grupo necesita mínimo ${limits.minJurorsPerTeam} evaluaciones.`,
        teamId,
        details: { jurors: after, minimum: limits.minJurorsPerTeam },
      });
    }
  }
  return warnings;
}

function jurorLoadWarnings(
  input: AssignmentRulesInput,
  teamsById: Map<number, RuleTeam>,
  evaluatorsById: Map<string, RuleEvaluator>,
  context: AssignmentWarningContext,
  limits: AssignmentLimits,
): AssignmentWarning[] {
  const warnings: AssignmentWarning[] = [];

  // Una revisión por jurado y edición en la que se le agregan grupos.
  const checks = new Map<string, { jurorId: string; editionId: number }>();
  for (const change of input.changes) {
    if (change.type !== 'ADD') continue;
    const editionId = teamsById.get(change.teamId)!.editionId;
    checks.set(`${change.jurorId}:${editionId}`, {
      jurorId: change.jurorId,
      editionId,
    });
  }

  for (const { jurorId, editionId } of checks.values()) {
    const evaluator = evaluatorsById.get(jurorId)!;

    const teams = new Map<number, string>();
    for (const team of context.teamsByJuror.get(jurorId) ?? []) {
      if (team.editionId === editionId) teams.set(team.id, team.teamCode);
    }
    for (const change of input.changes) {
      if (change.jurorId !== jurorId) continue;
      const team = teamsById.get(change.teamId)!;
      if (team.editionId !== editionId) continue;
      if (change.type === 'ADD') teams.set(team.id, team.teamCode);
      else teams.delete(team.id);
    }

    const teamIds = [...teams.keys()];
    if (teams.size > limits.maxTeamsPerJuror) {
      warnings.push({
        code: 'JUROR_OVER_LIMIT',
        message: `${subjectOf(evaluator)} quedaría con ${teams.size} grupos; el máximo recomendado es ${limits.maxTeamsPerJuror} por jurado.`,
        jurorId,
        details: {
          teams: teams.size,
          maximum: limits.maxTeamsPerJuror,
          teamIds,
        },
      });
    }

    const levels = [...new Set([...teams.values()].map(extractTeamLevel))]
      .filter((level): level is number => level !== null)
      .sort((a, b) => a - b);
    if (levels.length > 1) {
      warnings.push({
        code: 'JUROR_MIXED_LEVELS',
        message: `${subjectOf(evaluator)} quedaría con grupos de distintos niveles (${levels.map(levelLabel).join(', ')}); cada jurado debería evaluar grupos de un solo nivel.`,
        jurorId,
        details: { levels, teamIds },
      });
    }
  }

  return warnings;
}

function nrcConflictWarnings(
  input: AssignmentRulesInput,
  teamsById: Map<number, RuleTeam>,
  evaluatorsById: Map<string, RuleEvaluator>,
  context: AssignmentWarningContext,
): AssignmentWarning[] {
  const warnings: AssignmentWarning[] = [];

  for (const change of input.changes) {
    if (change.type !== 'ADD') continue;
    const team = teamsById.get(change.teamId)!;
    if (extractTeamLevel(team.teamCode) === 0) continue;

    const managed = context.managedNrcsByJuror.get(change.jurorId) ?? [];
    const teamNrcIds = new Set(
      (context.nrcsByTeam.get(team.id) ?? []).map((nrc) => nrc.id),
    );
    const shared = uniqueNrcs(managed.filter((nrc) => teamNrcIds.has(nrc.id)));
    if (shared.length === 0) continue;

    const evaluator = evaluatorsById.get(change.jurorId)!;
    const codes = shared.map((nrc) => nrc.code);
    warnings.push({
      code: 'NRC_CONFLICT',
      message: `${subjectOf(evaluator)} dicta el NRC ${codes.join(', ')} de integrantes del grupo ${team.teamCode} (conflicto de interés).`,
      jurorId: change.jurorId,
      teamId: team.id,
      details: { nrcCodes: codes },
    });
  }

  return warnings;
}

export const VALIDATION_UNAVAILABLE_WARNING: AssignmentWarning = {
  code: 'VALIDATION_UNAVAILABLE',
  message:
    'No se pudieron comprobar las reglas de asignación (grupos por jurado, niveles y NRC). Continúa solo si estás seguro.',
};

/**
 * Evalúa los cambios completos. Si hay bloqueos no calcula advertencias (no se
 * podrá guardar). Sin contexto (falló la carga) devuelve VALIDATION_UNAVAILABLE.
 */
export function evaluateAssignmentChanges(
  input: AssignmentRulesInput,
  context: AssignmentWarningContext | null,
): AssignmentValidationResult {
  const blockers = findBlockers(input);
  if (blockers.length > 0) return { blockers, warnings: [] };

  const warnings = context
    ? findWarnings(input, context)
    : [
        ...findWarnings(input, EMPTY_CONTEXT).filter(
          (warning) => warning.code === 'TEAM_UNDER_MIN',
        ),
        VALIDATION_UNAVAILABLE_WARNING,
      ];

  return { blockers, warnings };
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const EMPTY_CONTEXT: AssignmentWarningContext = {
  teamsByJuror: new Map(),
  managedNrcsByJuror: new Map(),
  nrcsByTeam: new Map(),
};

function indexInput(input: AssignmentRulesInput) {
  return {
    teamsById: new Map(input.teams.map((team) => [team.id, team])),
    evaluatorsById: new Map(input.evaluators.map((e) => [e.id, e])),
  };
}

function initialJurorsByTeam(teams: RuleTeam[]): Map<number, Set<string>> {
  return new Map(teams.map((team) => [team.id, new Set(team.jurorIds)]));
}

function applyChanges(
  changes: AssignmentChange[],
  jurorsByTeam: Map<number, Set<string>>,
) {
  for (const change of changes) {
    const jurors = jurorsByTeam.get(change.teamId);
    if (!jurors) continue;
    if (change.type === 'ADD') jurors.add(change.jurorId);
    else jurors.delete(change.jurorId);
  }
}

function getOrThrow<K, V>(map: Map<K, V>, key: K, entity: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(
      `Validación de asignación: falta el ${entity} ${String(key)}.`,
    );
  }
  return value;
}

function uniqueNrcs(nrcs: RuleNrc[]): RuleNrc[] {
  return [...new Map(nrcs.map((nrc) => [nrc.id, nrc])).values()];
}
