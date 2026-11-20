import {
  AssignmentBlocker,
  AssignmentWarning,
} from '../assignment-validation/assignment-rules.types';

/** HU-42 (ARK-275): qué pasó con cada equipo de una asignación en lote. */
export type BulkTeamStatus =
  | 'ASSIGNED' // se asignó sin advertencias
  | 'ASSIGNED_WITH_WARNINGS' // se asignó y el administrador aceptó advertencias
  | 'BLOCKED'; // no se asignó: tiene un bloqueo

export interface BulkBlock {
  code: string;
  message: string;
}

/**
 * Bloqueos que dependen del jurado y no del equipo: se repetirían en todos los equipos, así que
 * frenan toda la operación (400, como `assign`) en vez de marcar equipo por equipo.
 */
const JUROR_LEVEL_BLOCKERS: ReadonlySet<AssignmentBlocker['code']> = new Set([
  'INVALID_EVALUATOR_ROLE',
  'MISSING_JUROR_CATEGORY',
  'EVALUATOR_NOT_IN_EDITION',
]);

export function isJurorLevelBlocker(
  blocker: Pick<AssignmentBlocker, 'code'>,
): boolean {
  return JUROR_LEVEL_BLOCKERS.has(blocker.code);
}

/** Código con el que el front reconoce un bloqueo (el de edición ajena es el de HU-27). */
export function blockerCodeOf(
  blocker: Pick<AssignmentBlocker, 'code'>,
  editionReadOnlyCode: string,
): string {
  return blocker.code === 'TEAM_NOT_IN_ACTIVE_EDITION'
    ? editionReadOnlyCode
    : blocker.code;
}

/**
 * Un bloqueo por equipo (el primero). Un bloqueo sin `teamId` aplica a todos los equipos
 * (no debería ocurrir: las reglas de HU-08 siempre indican el equipo).
 */
export function blocksByTeam(
  blockers: AssignmentBlocker[],
  teamIds: number[],
  editionReadOnlyCode: string,
): Map<number, BulkBlock> {
  const result = new Map<number, BulkBlock>();
  for (const blocker of blockers) {
    const targets =
      blocker.teamId !== undefined && teamIds.includes(blocker.teamId)
        ? [blocker.teamId]
        : blocker.teamId === undefined
          ? teamIds
          : [];
    for (const teamId of targets) {
      if (!result.has(teamId)) {
        result.set(teamId, {
          code: blockerCodeOf(blocker, editionReadOnlyCode),
          message: blocker.message,
        });
      }
    }
  }
  return result;
}

/**
 * Advertencias que tocan a un equipo: las de ese equipo (grupo con pocos jurados, conflicto de
 * NRC) y las del jurado en general (más de 3 grupos, niveles mezclados), que valen para todos.
 */
export function warningsForTeam(
  warnings: AssignmentWarning[],
  teamId: number,
): AssignmentWarning[] {
  return warnings.filter(
    (warning) => warning.teamId === undefined || warning.teamId === teamId,
  );
}

export function statusOf(
  assignedWarnings: AssignmentWarning[],
): Exclude<BulkTeamStatus, 'BLOCKED'> {
  return assignedWarnings.length > 0 ? 'ASSIGNED_WITH_WARNINGS' : 'ASSIGNED';
}

/** «1 equipo» / «3 equipos». */
export function teamsLabel(n: number): string {
  return `${n} ${n === 1 ? 'equipo' : 'equipos'}`;
}

export function summaryMessage(assigned: number, blocked: number): string {
  if (assigned === 0) {
    return `No se asignó ningún equipo: ${teamsLabel(blocked)} ${blocked === 1 ? 'tiene' : 'tienen'} un bloqueo.`;
  }
  const done = `Se ${assigned === 1 ? 'asignó' : 'asignaron'} ${teamsLabel(assigned)} al jurado.`;
  return blocked === 0
    ? done
    : `${done} ${teamsLabel(blocked)} no se ${blocked === 1 ? 'asignó' : 'asignaron'} por un bloqueo.`;
}
