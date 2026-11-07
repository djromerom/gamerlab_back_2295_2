import { JurorType } from '@prisma/client';
import { EditionSummary } from '../juror-edition/juror-edition.types';
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
export interface AlertJuror {
  jurorId: string;
  name: string;
  category: string;
  isProfessor: boolean;
  /** Oficial o suplente en la edición; `null` en los profesores automáticos por NRC. */
  type: JurorType | null;
  state: JurorAttendanceState;
  checkedInAt: Date | null;
}

export interface AlertTotals {
  present: number;
  missing: number;
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
  /** `false` si todos llegaron o aún no es la hora de alerta (CU-12, 6.2). */
  alertActive: boolean;
  generatedAt: Date;
  /** El contador de jurados que faltan: se entrega en cualquier fase. */
  totals: AlertTotals;
  /** Vacía antes de la hora de alerta. */
  missingJurors: AlertJuror[];
  /** Grupos con evaluaciones por recibir, de más a menos faltantes. Vacía antes de la alerta. */
  groups: AlertGroup[];
}

export interface PanelJuror extends AlertJuror {
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
