import { Prisma } from '@prisma/client';

/**
 * ARK-147 (BG-31): en la tabla `evaluacion` conviven dos cosas con el mismo `jurorId`:
 *
 * - la **evaluación de jurado** (`EvaluationService`): siempre se guarda con sus detalles por
 *   criterio (`detalle_evaluacion`) y solo sobre equipos asignados;
 * - la **nota del profesor** a los equipos de sus NRC en «Calificaciones Uninorte»
 *   (`ProfessorsService.updateTeamEvaluation`, HU-01): solo `puntaje_total`, **sin detalles**.
 *
 * Las listas de «lo que evalué como jurado» (Equipos Evaluados, evaluaciones del profesor como
 * jurado) deben usar este filtro; si no, al profesor le aparecen los equipos de sus NRC que solo
 * calificó como docente. Ninguna ruta borra detalles, así que una evaluación de jurado nunca
 * queda sin ellos.
 */
export function jurorEvaluationsOf(jurorId: string): Prisma.EvaluationWhereInput {
  return {
    jurorId,
    isActive: true,
    details: { some: {} },
  };
}
