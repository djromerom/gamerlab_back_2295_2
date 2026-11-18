/** Mínimo de evaluaciones de jurados por equipo (P-10). */
export const MIN_EVALUATIONS = 3;

/**
 * BG-68 (ARK-270): el mínimo de 3 cuenta todas las evaluaciones de jurados del equipo, junior y
 * senior (decisión de Allison, 16-nov), igual que el panel de seguimiento («Recibidas 3»). No
 * cambia cómo se calcula la nota (HU-34): solo cuándo se marca «Menos de 3 evaluaciones».
 */
export function hasLessThanMinEvaluations(row: {
  juniorEvaluations: number;
  seniorEvaluations: number;
}): boolean {
  return row.juniorEvaluations + row.seniorEvaluations < MIN_EVALUATIONS;
}
