import { AssignmentWarning } from 'src/jurors/juror/assignment-validation/assignment-rules.types';
import { FairPhase } from 'src/jurors/absence-alert/fair-schedule';
import { LevelShortage, ShortageTeam } from '../group-shortage.logic';

/** 404: el jurado no es Suplente Junior confirmado de la edición activa. */
export const NOT_A_JUNIOR_SUBSTITUTE = 'NOT_A_JUNIOR_SUBSTITUTE';
/** 404: algún grupo no existe o está inactivo. */
export const TEAM_NOT_FOUND = 'TEAM_NOT_FOUND';
/** `reason` de la propuesta cuando ningún grupo elegible tiene faltantes. */
export const NO_SHORTAGE = 'NO_SHORTAGE';

/** Inicio de la nota de bitácora de cada grupo asignado por esta operación (para filtrarla). */
export const WALK_IN_AUDIT_NOTE =
  'Suplente con asignación automática de grupos (HU-24).';

/** Con qué se cuentan los jurados de cada grupo: asignados antes del control; presentes después. */
export type ShortageBasis = 'ASSIGNED' | 'PRESENT';

export interface TeamSuggestion {
  edition: { id: number; title: string };
  phase: FairPhase;
  basis: ShortageBasis;
  maxTeams: number;
  level: number | null;
  levelLabel: string | null;
  teams: ShortageTeam[];
  otherTeamsOfLevel: ShortageTeam[];
  levels: LevelShortage[];
  reason: null | typeof NO_SHORTAGE;
}

export interface TeamSummary {
  id: number;
  codigo: string;
  nombre: string;
}

export interface WalkInAssignmentResult {
  message: string;
  edicion: { id: number; title: string };
  jurado: { id: string; nombre: string };
  equiposAgregados: TeamSummary[];
  equiposYaAsignados: TeamSummary[];
  advertenciasAceptadas: AssignmentWarning[];
}
