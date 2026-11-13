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
  /**
   * ARK-131 (BG-18): si participa en la edición activa según `jurorsOfEdition` (HU-25).
   * `undefined` = no se comprobó (no bloquea); `false` bloquea agregarlo.
   */
  participatesInActiveEdition?: boolean;
}

export interface RuleTeam {
  id: number;
  teamCode: string;
  editionId: number;
  /** Nombre de la edición del equipo, para el mensaje de solo lectura (ARK-131). */
  editionTitle?: string | null;
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
  /**
   * ARK-131 (BG-18): la edición activa. Si se indica, todo cambio (agregar o quitar) sobre un
   * equipo de otra edición es un bloqueo. Sin indicarla no se revisa la edición.
   */
  activeEdition?: { id: number; title: string | null };
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
  | 'DUPLICATE_ASSIGNMENT'
  | 'TEAM_NOT_IN_ACTIVE_EDITION'
  | 'TEAM_NOT_CONFIRMED'
  | 'TEAM_NOT_GRADABLE'
  | 'EVALUATOR_NOT_IN_EDITION';

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
