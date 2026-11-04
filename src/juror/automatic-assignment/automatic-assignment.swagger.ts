import { ApiResponseOptions } from '@nestjs/swagger';

/** Documentación de Swagger de las reglas de HU-07 (asignación automática). */
export const AUTO_ASSIGNMENT_RULES_DOC = `
      **Reglas:**
      - Cada grupo recibe hasta 3 jurados; cada jurado hasta \`maxTeamsPerJuror\`
        grupos (por defecto 3), todos del mismo nivel.
      - Jurados: los de la edición (\`jurorsOfEdition\`, HU-25) sin remanentes
        (tipo Suplente en la edición), que quedan de reserva (HU-09).
      - Colegios (N0): solo seniors (profesores o categoría SENIOR).
      - Nadie evalúa equipos de sus propios NRC, salvo colegios.
      - Cada grupo universitario recibe, si es posible, un senior.
      - Lo ya asignado es fijo (P-21): no se quita y cuenta en la carga.

      **Confirmación:**
      - \`maxTeamsPerJuror\` debe enviarse igual en preview y en confirm (o no
        enviarse en ninguno); si cambia, confirm responde 409
        \`AUTO_ASSIGNMENT_OUTDATED\`.
      - Confirm guarda siempre en la edición activa; un \`editionId\` distinto
        responde 400 \`EDITION_READ_ONLY\`.
      - Sin bloqueo de concurrencia: dos confirmaciones simultáneas, o una
        asignación manual hecha mientras se guarda, no se detectan entre sí.
        No ejecutar la automática mientras otro administrador asigna a mano.

      **Alertas (\`alerts[].code\`):** TEAM_INCOMPLETE, TEAM_WITHOUT_SENIOR,
      SCHOOL_WITHOUT_SENIOR_JURORS, UNREADABLE_TEAM_LEVEL,
      JUROR_MISSING_CATEGORY, JUROR_FIXED_MIXED_LEVELS.
`;

export const AUTO_ASSIGNMENT_PREVIEW_EXAMPLE = {
  edition: { id: 5, title: 'Feria 2026-2', status: 'ACTIVE' },
  backupJurorsExcluded: 2,
  limits: { maxTeamsPerJuror: 3, jurorsPerTeam: 3 },
  assignments: [
    { teamId: 12, jurorId: 'd4e5f6a7-b8c9-4123-d456-678901234567' },
  ],
  summary: {
    teams: 40,
    completeTeams: 38,
    incompleteTeams: 2,
    teamsWithoutSenior: 1,
    newAssignments: 96,
    availableJurors: 41,
    jurorsWithNewTeams: 36,
  },
  levels: [
    {
      level: 1,
      label: 'Universitarios N1',
      teams: 12,
      completeTeams: 12,
      missingSlots: 0,
      teamsWithoutSenior: 0,
      jurors: 12,
    },
  ],
  teams: [
    {
      id: 12,
      teamCode: 'N1-AYP-06',
      teamName: 'Los Pixeles',
      level: 1,
      jurors: [
        {
          id: 'd4e5f6a7-b8c9-4123-d456-678901234567',
          name: 'Ana Pérez',
          kind: 'PROFESSOR',
          jurorCategory: null,
          fixed: false,
        },
      ],
      complete: false,
      hasSenior: true,
    },
  ],
  jurors: [
    {
      id: 'd4e5f6a7-b8c9-4123-d456-678901234567',
      name: 'Ana Pérez',
      kind: 'PROFESSOR',
      jurorCategory: null,
      level: 1,
      teamsBefore: 0,
      teamsAfter: 3,
    },
  ],
  alerts: [
    {
      code: 'TEAM_INCOMPLETE',
      message: 'El grupo N2-AYP2-05 (Game Lab) queda con 2 de 3 jurados.',
      teamId: 31,
      level: 2,
    },
  ],
};

export const AUTO_ASSIGNMENT_OUTDATED_DOC: ApiResponseOptions = {
  description:
    'El plan cambió desde la vista previa (`code: AUTO_ASSIGNMENT_OUTDATED`). No se guardó nada: generar la vista previa otra vez.',
  schema: {
    example: {
      statusCode: 409,
      code: 'AUTO_ASSIGNMENT_OUTDATED',
      message:
        'La asignación cambió desde la vista previa (equipos, jurados o asignaciones nuevas). No se guardó nada: genera la vista previa otra vez.',
    },
  },
};
