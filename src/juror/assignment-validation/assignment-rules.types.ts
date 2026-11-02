import { JurorCategory } from '@prisma/client';

/** Límites de HU-07/HU-08/HU-14. Son parámetros para poder configurarlos después. */
export interface AssignmentLimits {
  /** Máximo recomendado de grupos por jurado en una edición. */
  maxTeamsPerJuror: number;
  /** Mínimo de jurados (evaluaciones) por grupo. Más es válido. */
  minJurorsPerTeam: number;
}

export const DEFAULT_ASSIGNMENT_LIMITS: AssignmentLimits = {
  maxTeamsPerJuror: 3,
  minJurorsPerTeam: 3,
};

export type EvaluatorKind = 'PROFESSOR' | 'JUROR' | 'OTHER';

export interface RuleEvaluator {
  id: string;
  name: string;
  kind: EvaluatorKind;
  jurorCategory: JurorCategory | null;
}

export interface RuleTeam {
  id: number;
  teamCode: string;
  editionId: number;
  /** Jurados y profesores activos asignados hoy al equipo. */
  jurorIds: string[];
}

export interface RuleNrc {
  id: number;
  code: number;
}

export type AssignmentChange =
  | { type: 'ADD'; jurorId: string; teamId: number }
  | { type: 'REMOVE'; jurorId: string; teamId: number };

export interface AssignmentRulesInput {
  /** Equipos que tocan los cambios, con sus jurados actuales. */
  teams: RuleTeam[];
  /** Evaluadores que se agregan. */
  evaluators: RuleEvaluator[];
  /** Cambios en orden (reasignar = REMOVE + ADD). */
  changes: AssignmentChange[];
  limits?: Partial<AssignmentLimits>;
}

/** Datos extra que solo necesitan las advertencias (se cargan aparte). */
export interface AssignmentWarningContext {
  /** Equipos activos asignados hoy a cada jurado que se agrega. */
  teamsByJuror: Map<
    string,
    Array<{ id: number; teamCode: string; editionId: number }>
  >;
  /** NRC que dicta cada jurado que se agrega. */
  managedNrcsByJuror: Map<string, RuleNrc[]>;
  /** NRC de los integrantes de cada equipo afectado. */
  nrcsByTeam: Map<number, RuleNrc[]>;
}

export type AssignmentBlockerCode =
  | 'INVALID_EVALUATOR_ROLE'
  | 'UNREADABLE_TEAM_LEVEL'
  | 'MISSING_JUROR_CATEGORY'
  | 'SCHOOL_REQUIRES_SENIOR'
  | 'DUPLICATE_ASSIGNMENT';

export type AssignmentWarningCode =
  | 'JUROR_OVER_LIMIT'
  | 'JUROR_MIXED_LEVELS'
  | 'TEAM_UNDER_MIN'
  | 'NRC_CONFLICT'
  | 'VALIDATION_UNAVAILABLE';

export interface AssignmentBlocker {
  code: AssignmentBlockerCode;
  message: string;
  jurorId?: string;
  teamId?: number;
}

export interface AssignmentWarning {
  code: AssignmentWarningCode;
  /** Texto para el administrador: dice qué regla se rompe. */
  message: string;
  jurorId?: string;
  teamId?: number;
  details?: Record<string, unknown>;
}

export interface AssignmentValidationResult {
  blockers: AssignmentBlocker[];
  warnings: AssignmentWarning[];
}
