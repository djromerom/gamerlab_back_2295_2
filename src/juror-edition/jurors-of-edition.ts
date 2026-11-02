import { JurorEditionStatus, Prisma } from '@prisma/client';
import {
  JUROR_ROLE_NAME,
  PROFESSOR_ROLE_NAME,
} from '../juror-badges/juror-label';

/**
 * HU-25: la ÚNICA definición de "jurado de una edición". Devuelve un filtro de Prisma sobre
 * `User` que se combina con cualquier `where` (escarapelas, check-in, asignación, reportes):
 *
 * - jurados externos (rol Jurado) **confirmados** en la edición (`jurado_edicion`), y
 * - profesores con al menos un NRC **activo** en la edición (automáticos, sin confirmación).
 *
 * Siempre exige la cuenta activa. Quien solo tiene NRC de otra edición, o está Pendiente o
 * Declinó, no entra.
 */
export function jurorsOfEdition(
  editionId: number,
  ids?: string[],
): Prisma.UserWhereInput {
  return {
    isActive: true,
    ...(ids ? { id: { in: ids } } : {}),
    OR: [
      {
        role: { name: JUROR_ROLE_NAME },
        jurorEditions: {
          some: { editionId, status: JurorEditionStatus.CONFIRMED },
        },
      },
      {
        role: { name: PROFESSOR_ROLE_NAME },
        managedNrcs: { some: { editionId, isActive: true } },
      },
    ],
  };
}

/** Profesores que son jurados automáticos de la edición (NRC activo en ella). */
export function professorsOfEdition(editionId: number): Prisma.UserWhereInput {
  return {
    isActive: true,
    role: { name: PROFESSOR_ROLE_NAME },
    managedNrcs: { some: { editionId, isActive: true } },
  };
}
