/**
 * P-10: un grupo puede recibir más de 3 evaluaciones, pero solo cuentan las
 * 3 primeras por fecha y hora de envío; las demás se guardan.
 * Función común para HU-21 (seguimiento) y HU-04 (cálculo de la nota).
 */
export const MAX_COUNTED_EVALUATIONS = 3;

export interface DatedEvaluation {
  id: number;
  date: Date;
}

/** Ordena por hora de envío (y por id si empatan) y devuelve las que cuentan. */
export function countedEvaluations<T extends DatedEvaluation>(
  evaluations: readonly T[],
): T[] {
  return [...evaluations]
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id)
    .slice(0, MAX_COUNTED_EVALUATIONS);
}

/** Cuántas cuentan de `received` evaluaciones recibidas. */
export function countedTotal(received: number): number {
  return Math.min(received, MAX_COUNTED_EVALUATIONS);
}
