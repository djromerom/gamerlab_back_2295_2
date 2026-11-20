import { JurorType } from '@prisma/client';
import { EditionSummary } from 'src/jurors/juror-edition/juror-edition.types';
import { FairPhase, FairScheduleValues } from './fair-schedule';

/**
 * Estado de asistencia de un jurado en el panel. `ABSENT` se calcula: es quien no tiene check-in
 * desde la hora de control; si llega después, pasa a `PRESENT`. La "posible salida" de HU-23 se
 * agregará aquí cuando exista ese ticket.
 */
export const JUROR_ATTENDANCE_STATES = [
  'NO_CHECK_IN',
  'PRESENT',
  'ABSENT',
] as const;
export type JurorAttendanceState = (typeof JUROR_ATTENDANCE_STATES)[number];

/** Un jurado en la alerta o el panel. Lo ven los profesores: sin correos, códigos ni teléfonos. */
export interface AttendanceJuror {
  jurorId: string;
  name: string;
  category: string;
  isProfessor: boolean;
  /** Oficial o suplente en la edición; `null` en los profesores automáticos por NRC. */
  type: JurorType | null;
  /**
   * `ABSENT` desde la hora de control; el que «No podrá asistir» (HU-44) es `ABSENT` a cualquier
   * hora.
   */
  state: JurorAttendanceState;
  checkedInAt: Date | null;
  /**
   * HU-44 (ARK-293): ausente confirmado. Su última respuesta de HU-13 es «No podrá asistir» y no
   * hizo check-in después. Sus grupos se cubren con suplentes (Contingencia); no se le quitan.
   */
  notComing: boolean;
  /** Cuándo se registró ese «No podrá asistir»; `null` si `notComing` es `false`. */
  notComingSince: Date | null;
}

/** HU-44: un grupo asignado a un jurado de la alerta. */
export interface AlertJurorGroup {
  teamId: number;
  teamCode: string;
  /** Nivel del código (`N1`…), igual que en `groups`. */
  level: string | null;
  /** El jurado ya envió su evaluación de este grupo. */
  evaluated: boolean;
}

/** Un jurado de la alerta con sus grupos (HU-44). */
export interface AlertJuror extends AttendanceJuror {
  groups: AlertJurorGroup[];
  /** Grupos que le faltan por calificar. */
  pendingGroups: number;
}

export interface AlertTotals {
  present: number;
  /** Faltan por llegar (sin check-in), sin contar a los que no vendrán. */
  missing: number;
  /** HU-44: «No podrá asistir» vigente. */
  notComing: number;
  total: number;
}

/** Un grupo con lo que le falta. Solo cuentan las 3 primeras evaluaciones (P-10). */
export interface AlertGroup {
  teamId: number;
  teamCode: string;
  teamName: string;
  videogame: string;
  level: string | null;
  assignedJurors: number;
  presentJurors: number;
  evaluationsCounted: number;
  missingEvaluations: number;
}

export interface AbsenceAlert {
  edition: EditionSummary;
  schedule: FairScheduleValues;
  phase: FairPhase;
  /**
   * `true` desde la hora de alerta si falta algún jurado o algún grupo aún no tiene sus evaluaciones.
   * `false` antes de esa hora, o si todos llegaron y todos los grupos están completos.
   */
  alertActive: boolean;
  generatedAt: Date;
  /** El contador de jurados que faltan: se entrega en cualquier fase. */
  totals: AlertTotals;
  /** «Faltan por llegar». Vacía antes de la hora de alerta. Sin los que no vendrán. */
  missingJurors: AlertJuror[];
  /** HU-44: «No vendrán», a cualquier hora (la respuesta se registra a mano). */
  notComingJurors: AlertJuror[];
  /** Grupos con evaluaciones por recibir, de más a menos faltantes. Vacía antes de la alerta. */
  groups: AlertGroup[];
}

export interface PanelJuror extends AttendanceJuror {
  hasEvaluated: boolean;
}

export interface PanelGroup extends AlertGroup {
  jurors: PanelJuror[];
}

export interface AbsencePanel {
  edition: EditionSummary;
  phase: FairPhase;
  generatedAt: Date;
  totals: AlertTotals;
  data: PanelGroup[];
}
