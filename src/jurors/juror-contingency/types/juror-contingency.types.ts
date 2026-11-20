import { FairPhase } from 'src/jurors/absence-alert/fair-schedule';
import { AssignmentWarning } from 'src/jurors/juror/assignment-validation/assignment-rules.types';
import {
  ContingencyBasis,
  GroupAtRisk,
  GroupSuggestion,
} from '../contingency.logic';

/** Mínimo de evaluaciones por grupo si la edición no tiene configuración (P-10). */
export const DEFAULT_MIN_EVALUATIONS = 3;

/** Inicio de la nota de bitácora de cada asignación aceptada (para filtrarla). */
export const CONTINGENCY_AUDIT_NOTE =
  'Suplente de contingencia desde módulo admin (HU-14).';

/** 400: algún suplente no es Suplente confirmado de la edición activa. */
export const NOT_A_SUBSTITUTE = 'NOT_A_SUBSTITUTE';
/** 404: algún grupo no existe o está inactivo. */
export const TEAM_NOT_FOUND = 'TEAM_NOT_FOUND';
/** 400: el grupo no tiene una sugerencia que rechazar. */
export const NO_SUGGESTION_TO_REJECT = 'NO_SUGGESTION_TO_REJECT';

/** Contexto común de las respuestas de contingencia. */
export interface ContingencyContext {
  edicion: { id: number; title: string };
  /** Fase del cronograma (HU-12). */
  fase: FairPhase;
  /** Antes de la hora de control cuentan los asignados; desde ella, los presentes. */
  base: ContingencyBasis;
  minimoEvaluaciones: number;
  generadoEn: Date;
}

export interface GroupsAtRiskResponse extends ContingencyContext {
  grupos: GroupAtRisk[];
}

export interface GroupSuggestionWithWarnings extends GroupSuggestion {
  /** Advertencias de HU-08 si se aceptan los `sugeridos` de este grupo. */
  advertencias: AssignmentWarning[];
}

export interface SuggestionsResponse extends ContingencyContext {
  totales: {
    gruposEnRiesgo: number;
    faltantes: number;
    sugeridos: number;
    sinCubrir: number;
  };
  /** Suplentes confirmados de la edición que se tuvieron en cuenta. */
  suplentesDisponibles: number;
  grupos: GroupSuggestionWithWarnings[];
}

export interface TeamRef {
  id: number;
  codigo: string;
  nombre: string;
}

export interface AcceptSuggestionsResult {
  message: string;
  edicion: { id: number; title: string };
  suplentes: Array<{
    id: string;
    nombre: string;
    equiposAgregados: TeamRef[];
    equiposYaAsignados: TeamRef[];
  }>;
  totales: { asignacionesAgregadas: number; asignacionesOmitidas: number };
  advertenciasAceptadas: AssignmentWarning[];
}

export interface RejectSuggestionResult {
  message: string;
  equipo: TeamRef;
  suplentesRechazados: Array<{ id: string; nombre: string }>;
  motivo: string | null;
  rechazadoEn: Date;
}
