/**
 * Reglas de un puntaje por criterio, comunes al envío definitivo (`EvaluationService`) y al
 * borrador (HU-18): número finito entre 0 y 5 con máximo 2 decimales.
 */
export const MAX_SCORE = 5;

/**
 * `Number.isInteger(score * 100)` no sirve: 4.35 * 100 = 434.99999999999994 en coma flotante.
 * Se compara contra el entero más cercano con una tolerancia muy por debajo de 0.001.
 */
export function hasAtMostTwoDecimals(score: number): boolean {
  const scaled = score * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** El mensaje de error del puntaje, o `null` si es válido. */
export function scoreError(criterionId: number, score: unknown): string | null {
  if (
    typeof score !== 'number' ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > MAX_SCORE
  ) {
    return `Score for criterion ${criterionId} is out of range (0-5). Score: ${String(score)}`;
  }
  if (!hasAtMostTwoDecimals(score)) {
    return `El puntaje del criterio ${criterionId} admite como máximo 2 decimales. Puntaje: ${score}`;
  }
  return null;
}
