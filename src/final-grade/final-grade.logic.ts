import {
  DEFAULT_FAIR_TIMES,
  fairInstant,
} from '../absence-alert/fair-schedule';
import { MIN_EVALUATIONS, parseLevel } from '../ranking/ranking.logic';

/**
 * HU-20 (ARK-80): reglas de la nota final que ve el estudiante, sin acceso a la base.
 *
 * - La nota es la misma del ranking (`vw_team_final_scores`, HU-04 / HU-34): aquí no se calcula ni
 *   se pondera nada, solo se decide si se puede mostrar.
 * - El administrador la libera desde la hora de cierre del día de la feria, en hora de Colombia:
 *   la del cronograma de la edición (HU-12) o, si no está configurado, las 12:00 del día en que
 *   inicia la edición (`Edition.startsAt`).
 * - Un grupo sin nota de los profesores o sin nota de los jurados junior queda en «Nota en
 *   proceso» (aclaración de Allison del 7-nov en HU-34). Excepciones, las mismas del ranking:
 *   los colegios (N0) no tienen jurados junior (P-08) y cuentan solo a profesores y seniors; los
 *   equipos con la marca de externo cuentan solo la nota de los jurados junior.
 */

/** Hora de cierre por defecto (P-09) cuando la edición no tiene cronograma (HU-12). */
export const FINAL_GRADE_RELEASE_TIME = DEFAULT_FAIR_TIMES.closeTime;
export const FINAL_GRADE_TIME_ZONE = 'America/Bogota';
/** Colombia no tiene horario de verano: siempre UTC-5. */
const BOGOTA_UTC_OFFSET_HOURS = -5;

export const FINAL_GRADE_RELEASE_TOO_EARLY = 'FINAL_GRADE_RELEASE_TOO_EARLY';

export type IncompleteReason =
  | 'MISSING_PROFESSOR_SCORE'
  | 'MISSING_JUNIOR_SCORE'
  | 'LESS_THAN_MIN_EVALUATIONS';

export type StudentGradeStatus = 'NOT_RELEASED' | 'IN_PROCESS' | 'AVAILABLE';

/** Fila de `vw_team_final_scores` con los campos que usa esta regla. */
export interface FinalScoreRow {
  teamId: number;
  teamCode: string | null;
  teamName: string | null;
  isExternal: boolean;
  videogameName: string | null;
  finalScore: number | null;
  juniorEvaluations: number;
  seniorEvaluations: number;
}

export interface TeamGradeCheck {
  /** «Nota en proceso»: el estudiante no ve una nota parcial. */
  inProcess: boolean;
  reasons: IncompleteReason[];
}

/** Día en Colombia de un instante, como `YYYY-MM-DD`. */
function bogotaDay(instant: Date): string {
  return new Date(instant.getTime() + BOGOTA_UTC_OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

export interface ReleaseMoment {
  /** Primer instante (UTC) en que se puede liberar la nota. */
  at: Date;
  /** Día de la feria, `YYYY-MM-DD` (hora de Colombia). */
  fairDate: string;
  /** Hora de cierre usada, `HH:mm` (hora de Colombia). */
  releaseTime: string;
  /** `true` si salió del cronograma de la feria (HU-12); `false` si es el valor por defecto. */
  fromSchedule: boolean;
}

/**
 * Desde cuándo se puede liberar la nota: la hora de cierre del día de la feria, en hora de
 * Colombia. Usa el cronograma de la edición (HU-12, `cronograma_feria`) si está configurado; si
 * no, el día en que inicia la edición y la hora de cierre por defecto (12:00).
 */
export function resolveReleaseMoment(
  editionStartsAt: Date,
  schedule: { fairDate: Date; closeTime: string } | null | undefined,
): ReleaseMoment {
  const fairDate = schedule
    ? schedule.fairDate.toISOString().slice(0, 10)
    : bogotaDay(editionStartsAt);
  const releaseTime = schedule?.closeTime ?? FINAL_GRADE_RELEASE_TIME;
  return {
    at: fairInstant(fairDate, releaseTime),
    fairDate,
    releaseTime,
    fromSchedule: Boolean(schedule),
  };
}

/** `2026-11-26` → «26/11/2026», para los mensajes. */
export function formatFairDay(fairDate: string): string {
  const [year, month, day] = fairDate.split('-');
  return `${day}/${month}/${year}`;
}

export function isSchool(teamCode: string | null | undefined): boolean {
  return parseLevel(teamCode) === 0;
}

/** Qué le falta a un grupo y si su nota queda «en proceso». */
export function checkTeamGrade(
  row: FinalScoreRow | null | undefined,
): TeamGradeCheck {
  if (!row) {
    // Sin fila en la vista: el equipo no tiene videojuego registrado.
    return {
      inProcess: true,
      reasons: ['MISSING_PROFESSOR_SCORE', 'MISSING_JUNIOR_SCORE'],
    };
  }
  // Qué partes cuentan en su nota (igual que el ranking, HU-34): un colegio solo cuenta a los
  // profesores y seniors, con o sin marca de externo; un externo solo a los jurados junior.
  const school = isSchool(row.teamCode);
  const countsProfessors = school || !row.isExternal;
  const countsJurors = !school;
  const reasons: IncompleteReason[] = [];
  if (countsProfessors && row.seniorEvaluations === 0)
    reasons.push('MISSING_PROFESSOR_SCORE');
  if (countsJurors && row.juniorEvaluations === 0)
    reasons.push('MISSING_JUNIOR_SCORE');
  if (countsJurors && row.juniorEvaluations < MIN_EVALUATIONS) {
    reasons.push('LESS_THAN_MIN_EVALUATIONS');
  }
  const inProcess =
    row.finalScore === null ||
    reasons.includes('MISSING_PROFESSOR_SCORE') ||
    reasons.includes('MISSING_JUNIOR_SCORE');
  return { inProcess, reasons };
}

/** Nota que se le muestra al estudiante, con 2 decimales, o `null` si no se puede mostrar. */
export function studentGrade(
  released: boolean,
  row: FinalScoreRow | null | undefined,
): { status: StudentGradeStatus; finalGrade: number | null } {
  if (!released) return { status: 'NOT_RELEASED', finalGrade: null };
  if (checkTeamGrade(row).inProcess || row?.finalScore == null) {
    return { status: 'IN_PROCESS', finalGrade: null };
  }
  return {
    status: 'AVAILABLE',
    finalGrade: Math.round(row.finalScore * 100) / 100,
  };
}
