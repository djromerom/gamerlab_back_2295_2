import { JurorEditionStatus, Prisma } from '@prisma/client';
import {
  JUROR_ROLE_NAME,
  PROFESSOR_ROLE_NAME,
} from '../juror-badges/juror-label';

/**
 * Roles que pueden tener fila en `jurado_edicion` (HU-25 + HU-28): el jurado externo y el
 * profesor senior que no tiene NRC en la edición (P-07: todo profesor es senior).
 */
export const ENROLLABLE_ROLE_NAMES: readonly string[] = [
  JUROR_ROLE_NAME,
  PROFESSOR_ROLE_NAME,
];

/** Cuentas activas que se pueden inscribir en una edición (Jurado o Profesor). */
export function enrollableAccountWhere(): Prisma.UserWhereInput {
  return { isActive: true, role: { name: { in: [...ENROLLABLE_ROLE_NAMES] } } };
}

/**
 * HU-25: la ÚNICA definición de "jurado de una edición". Devuelve un filtro de Prisma sobre
 * `User` que se combina con cualquier `where` (escarapelas, check-in, asignación, reportes):
 *
 * - cuentas inscritas y **confirmadas** en la edición (`jurado_edicion`): jurados externos
 *   (rol Jurado) y, desde HU-28, profesores senior sin NRC en la edición inscritos por correo
 *   (rol Profesor), y
 * - profesores con al menos un NRC **activo** en la edición (automáticos, sin confirmación).
 *
 * Siempre exige la cuenta activa. Quien solo tiene NRC de otra edición, o está Pendiente o
 * Declinó, no entra.
 *
 * Oficial o Suplente (decidido el 2026-11-02, PR #218): en una edición manda
 * `jurado_edicion.tipo` (`JurorEdition.type`). `User.jurorType` es solo un dato de la cuenta:
 * aquí únicamente sirve de valor inicial al traer jurados cuando la edición anterior no tiene
 * lista. El Excel de asignación (HU-16) ya lee el tipo de la edición (BG-40). El formulario de
 * Personal → Jurados (BG-05) y el listado de jurados todavía leen `User.jurorType`; pasan a la
 * edición y la columna se retira en un ticket aparte después de la feria del 26 de noviembre.
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
        role: { name: { in: [...ENROLLABLE_ROLE_NAMES] } },
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
