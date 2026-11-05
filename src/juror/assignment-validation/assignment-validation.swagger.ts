import { ApiResponseOptions } from '@nestjs/swagger';

/** Documentación de Swagger de las reglas de HU-08 (asignación manual). */
export const ASSIGNMENT_RULES_DOC = `
      **Bloqueos (no se guardan):** usuario que no es jurado ni profesor, nivel
      ilegible en el código del equipo, jurado sin categoría, jurado no senior
      en colegios (N0) y asignación duplicada (409).

      **Edición activa (ARK-131, 400):**
      - Equipo de otra edición (asignar, reasignar y quitar): \`code: EDITION_READ_ONLY\`,
        \`blocker: TEAM_NOT_IN_ACTIVE_EDITION\`.
      - Evaluador que no participa en la edición activa (asignar y el nuevo de reasignar):
        \`code: EVALUATOR_NOT_IN_EDITION\`. Participa el jurado confirmado en Jurados de la
        edición y el profesor con un NRC activo en ella (HU-25). Quitar no lo exige.
      - Sin edición activa: 404 \`NO_ACTIVE_EDITION\`.

      **Advertencias (409 ASSIGNMENT_WARNINGS, se guardan con confirmWarnings: true):**
      - JUROR_OVER_LIMIT: el jurado queda con más de 3 grupos en la edición.
      - JUROR_MIXED_LEVELS: el jurado queda con grupos de distintos niveles.
      - TEAM_UNDER_MIN: el cambio deja al grupo con menos de 3 jurados.
      - NRC_CONFLICT: el jurado dicta un NRC de los integrantes (salvo colegios).
      - VALIDATION_UNAVAILABLE: no se pudieron comprobar las reglas.

      Cada cambio queda en la bitácora con las advertencias aceptadas.
`;

export const ASSIGNMENT_CONFLICT_DOC: ApiResponseOptions = {
  description:
    'Asignación duplicada, o advertencias sin confirmar (`code: ASSIGNMENT_WARNINGS`). Reenviar con `confirmWarnings: true` para guardar.',
  schema: {
    example: {
      statusCode: 409,
      code: 'ASSIGNMENT_WARNINGS',
      message:
        'La asignación rompe reglas de asignación. Confirma para continuar:\n- El jurado senior Ana Pérez quedaría con 4 grupos; el máximo recomendado es 3 por jurado.',
      warnings: [
        {
          code: 'JUROR_OVER_LIMIT',
          message:
            'El jurado senior Ana Pérez quedaría con 4 grupos; el máximo recomendado es 3 por jurado.',
          jurorId: 'd4e5f6a7-b8c9-4123-d456-678901234567',
          details: { teams: 4, maximum: 3, teamIds: [2, 5, 7, 9] },
        },
      ],
    },
  },
};
