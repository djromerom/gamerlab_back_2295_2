import { ConflictException, ForbiddenException } from '@nestjs/common';

/**
 * BG-71 (ARK-285): mismo código que usa presencia (`JUROR_NOT_CHECKED_IN` de HU-23), para que el
 * front lo trate igual: el jurado todavía no registró su llegada en la mesa.
 */
export const JUROR_NOT_CHECKED_IN = 'JUROR_NOT_CHECKED_IN';

/** Texto del bloqueo; es el mismo que muestra el front en las pantallas de calificar. */
export const NOT_CHECKED_IN_MESSAGE =
  'Registra tu llegada en la mesa de ARKAD para poder calificar.';

/**
 * Excepción de un bloqueo de `findEvaluationBlockers`: el de «sin check-in» es un 409 con `code`;
 * los demás (asignación, edición, colegios…) siguen siendo 403 con el motivo como mensaje.
 */
export function evaluationBlockerException(
  blocker: string,
): ConflictException | ForbiddenException {
  if (blocker === NOT_CHECKED_IN_MESSAGE) {
    return new ConflictException({
      statusCode: 409,
      code: JUROR_NOT_CHECKED_IN,
      message: NOT_CHECKED_IN_MESSAGE,
    });
  }
  return new ForbiddenException(blocker);
}
