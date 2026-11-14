import { JurorCategory } from '@prisma/client';

import { EvaluatorKind } from '../assignment-validation/assignment-rules.types';

/** Límites de la asignación automática (HU-07). */
export interface AutoAssignmentLimits {
  /** Máximo de grupos por jurado en la edición (configurable, por defecto 3). */
  maxTeamsPerJuror: number;
  /** Jurados que debe tener cada grupo (la automática no pasa de aquí). */
  jurorsPerTeam: number;
}

/** Evaluador que ya está en un equipo (fijo) o que se puede asignar. */
export interface PlannerEvaluator {
  id: string;
  name: string;
  kind: EvaluatorKind;
  jurorCategory: JurorCategory | null;
}

/** Evaluador de la edición que la automática puede usar (oficial, no remanente). */
export interface PlannerJuror extends PlannerEvaluator {
  /** NRC activos que dicta (solo profesores tienen). */
  managedNrcIds: number[];
}

export interface PlannerTeam {
  id: number;
  teamCode: string;
  teamName: string;
  /** Solo los equipos con videojuego confirmado reciben jurados. */
  assignable: boolean;
  /** Evaluadores asignados hoy: son fijos (P-21) y nunca se quitan. */
  assigned: PlannerEvaluator[];
  /** NRC activos de los integrantes activos. */
  memberNrcIds: number[];
}

export interface PlannerInput {
  teams: PlannerTeam[];
  /** Jurados oficiales de la edición (sin remanentes). */
  jurors: PlannerJuror[];
  limits: AutoAssignmentLimits;
}

export interface PlannedAssignment {
  teamId: number;
  jurorId: string;
}

export type AutoAssignmentAlertCode =
  | 'TEAM_INCOMPLETE'
  | 'TEAM_WITHOUT_SENIOR'
  | 'SCHOOL_WITHOUT_SENIOR_JURORS'
  | 'UNREADABLE_TEAM_LEVEL'
  | 'JUROR_MISSING_CATEGORY'
  | 'JUROR_FIXED_MIXED_LEVELS';

export interface AutoAssignmentAlert {
  code: AutoAssignmentAlertCode;
  message: string;
  teamId?: number;
  jurorId?: string;
  level?: number;
}

export interface PlannedTeamJuror {
  id: string;
  name: string;
  kind: EvaluatorKind;
  jurorCategory: JurorCategory | null;
  /** true = ya estaba asignado (no se toca); false = lo agrega la automática. */
  fixed: boolean;
}

export interface PlannedTeam {
  id: number;
  teamCode: string;
  teamName: string;
  level: number | null;
  jurors: PlannedTeamJuror[];
  complete: boolean;
  hasSenior: boolean;
}

export interface PlannedJuror {
  id: string;
  name: string;
  kind: EvaluatorKind;
  jurorCategory: JurorCategory | null;
  /** Nivel que se le fijó (null si no recibe grupos). */
  level: number | null;
  teamsBefore: number;
  teamsAfter: number;
}

export interface LevelCoverage {
  level: number;
  label: string;
  teams: number;
  completeTeams: number;
  missingSlots: number;
  teamsWithoutSenior: number;
  jurors: number;
}

export interface AutoAssignmentSummary {
  teams: number;
  completeTeams: number;
  incompleteTeams: number;
  teamsWithoutSenior: number;
  newAssignments: number;
  availableJurors: number;
  jurorsWithNewTeams: number;
}

export interface AutoAssignmentPlan {
  limits: AutoAssignmentLimits;
  /** Asignaciones nuevas: es lo que se envía a `confirm`. */
  assignments: PlannedAssignment[];
  summary: AutoAssignmentSummary;
  levels: LevelCoverage[];
  teams: PlannedTeam[];
  jurors: PlannedJuror[];
  alerts: AutoAssignmentAlert[];
}
