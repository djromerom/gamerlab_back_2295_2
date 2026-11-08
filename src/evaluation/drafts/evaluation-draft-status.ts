/**
 * HU-18 (ARK-104): estado de un borrador para la lista del jurado y el flujo alterno A1 de CU-18.
 * - PENDING: se puede continuar y enviar.
 * - ALREADY_SUBMITTED: ya hay una evaluación de este jurado para el juego (A1: ofrecer descartar).
 * - NOT_ASSIGNED: la asignación cambió o el juego ya no se puede calificar (A1: ofrecer descartar);
 *   `blockedReason` lleva el motivo con el mismo texto que daría el envío.
 */
export const DRAFT_STATUS = {
  PENDING: 'PENDING',
  ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
  NOT_ASSIGNED: 'NOT_ASSIGNED',
} as const;

export type DraftStatus = (typeof DRAFT_STATUS)[keyof typeof DRAFT_STATUS];

/** Enviado gana sobre bloqueado: si ya se envió, lo único que queda es descartar el borrador. */
export function draftStatusOf(
  alreadySubmitted: boolean,
  blockedReason: string | undefined,
): { status: DraftStatus; blockedReason?: string } {
  if (alreadySubmitted) return { status: DRAFT_STATUS.ALREADY_SUBMITTED };
  if (blockedReason)
    return { status: DRAFT_STATUS.NOT_ASSIGNED, blockedReason };
  return { status: DRAFT_STATUS.PENDING };
}
