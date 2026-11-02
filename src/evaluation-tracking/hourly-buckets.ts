import { countedTotal } from '../evaluation/counted-evaluations';

/** Horas de corte de la feria (HU-21). HU-12 las hará configurables por edición. */
export const TRACKING_HOURS = [8, 9, 10, 11, 12] as const;

/** Hora en la que un grupo con menos de 3 evaluaciones se resalta (CU-21, A1). */
export const MINIMUM_CHECK_HOUR = 11;

/** Colombia está en UTC-5 todo el año (sin horario de verano). */
const BOGOTA_UTC_OFFSET_HOURS = 5;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface HourBucket {
  hour: number;
  received: number;
  counted: number;
}

/** Fecha de hoy en Bogotá, en formato `YYYY-MM-DD`. */
export function todayInBogota(now: Date = new Date()): string {
  const bogota = new Date(now.getTime() - BOGOTA_UTC_OFFSET_HOURS * 3_600_000);
  return bogota.toISOString().slice(0, 10);
}

/** `null` si la fecha no existe en el calendario (por ejemplo 2026-02-30). */
export function parseFairDate(
  date: string,
): { year: number; month: number; day: number } | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Instante UTC de las `hour`:00 en Bogotá del día `date` (ya validado). */
export function bogotaCutoff(date: string, hour: number): Date {
  const parsed = parseFairDate(date);
  if (!parsed) throw new Error(`Fecha no válida: ${date}`);
  return new Date(
    Date.UTC(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      hour + BOGOTA_UTC_OFFSET_HOURS,
    ),
  );
}

/**
 * Cortes acumulados: a cada hora, cuántas evaluaciones tenía el grupo
 * (enviadas hasta esa hora inclusive) y cuántas de ellas contaban.
 */
export function buildHourlyBuckets(
  submittedAt: readonly Date[],
  date: string,
  hours: readonly number[] = TRACKING_HOURS,
): HourBucket[] {
  return hours.map((hour) => {
    const cutoff = bogotaCutoff(date, hour).getTime();
    const received = submittedAt.filter((d) => d.getTime() <= cutoff).length;
    return { hour, received, counted: countedTotal(received) };
  });
}
