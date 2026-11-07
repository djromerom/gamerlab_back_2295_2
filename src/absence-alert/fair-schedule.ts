import {
  bogotaCutoff,
  parseFairDate,
} from '../evaluation-tracking/hourly-buckets';

/** Cronograma de la feria (P-09). Horas "HH:mm" en hora de Bogotá. */
export interface FairScheduleTimes {
  startTime: string;
  alertTime: string;
  controlTime: string;
  closeTime: string;
}

export interface FairScheduleValues extends FairScheduleTimes {
  /** `YYYY-MM-DD`; `null` mientras el administrador no configure el cronograma. */
  fairDate: string | null;
}

/** Valores por defecto del cronograma definido el 23 de octubre (P-09). */
export const DEFAULT_FAIR_TIMES: Readonly<FairScheduleTimes> = {
  startTime: '08:00',
  alertTime: '10:00',
  controlTime: '11:00',
  closeTime: '12:00',
};

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * - `NOT_CONFIGURED`: la edición no tiene fecha de feria: no hay alerta. Sin fecha, las 11:00
 *   llegarían todos los días y todos los jurados saldrían ausentes.
 * - `BEFORE_ALERT`: todavía no es la hora de alerta del día de la feria.
 * - `ALERT`: alerta informativa (10:00).
 * - `CONTROL`: alerta definitiva (11:00): quien no llegó queda ausente.
 * - `CLOSED`: pasó la hora de cierre (12:00); los ausentes siguen ausentes.
 */
export const FAIR_PHASES = [
  'NOT_CONFIGURED',
  'BEFORE_ALERT',
  'ALERT',
  'CONTROL',
  'CLOSED',
] as const;
export type FairPhase = (typeof FAIR_PHASES)[number];

/** Instante UTC de una hora "HH:mm" de Bogotá en el día `date` (ya validados). */
export function fairInstant(date: string, time: string): Date {
  const [hour, minute] = time.split(':').map(Number);
  return new Date(bogotaCutoff(date, hour).getTime() + minute * 60_000);
}

/** La fase se calcula con la hora actual: no se guarda ni hace falta un proceso programado. */
export function fairPhase(
  schedule: FairScheduleValues,
  now: Date = new Date(),
): FairPhase {
  const { fairDate } = schedule;
  if (!fairDate) return 'NOT_CONFIGURED';
  const reached = (time: string) =>
    now.getTime() >= fairInstant(fairDate, time).getTime();
  if (reached(schedule.closeTime)) return 'CLOSED';
  if (reached(schedule.controlTime)) return 'CONTROL';
  if (reached(schedule.alertTime)) return 'ALERT';
  return 'BEFORE_ALERT';
}

/** Desde la hora de alerta el panel muestra las listas. */
export function isAlertReached(phase: FairPhase): boolean {
  return phase === 'ALERT' || phase === 'CONTROL' || phase === 'CLOSED';
}

/** Desde la hora de control quien no tiene check-in queda como ausente. */
export function isControlReached(phase: FairPhase): boolean {
  return phase === 'CONTROL' || phase === 'CLOSED';
}

/** Mensaje de error si la fecha no existe o las horas no van en orden; si no, `null`. */
export function scheduleProblem(
  schedule: FairScheduleTimes & { fairDate: string },
): string | null {
  if (!parseFairDate(schedule.fairDate)) {
    return 'La fecha de la feria no es válida';
  }
  const { startTime, alertTime, controlTime, closeTime } = schedule;
  // "HH:mm" con ceros a la izquierda se ordena igual como texto que como hora.
  if (
    !(
      startTime < alertTime &&
      alertTime < controlTime &&
      controlTime < closeTime
    )
  ) {
    return 'Las horas deben ir en orden: inicio, alerta, control y cierre';
  }
  return null;
}
