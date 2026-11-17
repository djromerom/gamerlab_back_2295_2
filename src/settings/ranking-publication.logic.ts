/**
 * BG-67 (ARK-268): una sola regla de «notas publicadas» para todo lo público.
 *
 * Las notas (ranking, `GET /teams/final-score/*`) se ven sin permiso solo si el administrador
 * publicó el ranking (`showRanking`) **y** liberó la nota final (`showFinalGrade`, HU-20). Así
 * «Mis Calificaciones» y `/ranking` nunca muestran cosas distintas: si el ranking está publicado,
 * el estudiante ya ve su nota.
 */
export interface RankingPublicationFlags {
  showRanking: boolean;
  showFinalGrade: boolean;
}

export const RANKING_REQUIRES_FINAL_GRADE = 'RANKING_REQUIRES_FINAL_GRADE';

export const RANKING_REQUIRES_FINAL_GRADE_MESSAGE =
  'Primero libera la nota final; el ranking se publica después.';

/** Sin configuración de la edición activa (periodo entre ediciones) el ranking está oculto. */
export function isRankingPublished(
  flags?: RankingPublicationFlags | null,
): boolean {
  return flags?.showRanking === true && flags.showFinalGrade === true;
}

/** Publicar el ranking exige la nota final liberada; ocultarlo se puede siempre. */
export function canPublishRanking(
  show: boolean,
  flags: Pick<RankingPublicationFlags, 'showFinalGrade'>,
): boolean {
  return !show || flags.showFinalGrade === true;
}
