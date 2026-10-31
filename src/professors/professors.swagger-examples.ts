// Ejemplos de Swagger de ProfessorsController (solo documentacion, sin logica).

export const CREATE_PROFESSOR_REQUEST_EXAMPLES = {
  default: {
    summary: 'Create professor example',
    value: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@uninorte.edu.co',
    },
  },
};

export const CREATE_PROFESSOR_RESPONSE_EXAMPLE = {
  id: 'a1b2c3d4-uuid-example',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@uninorte.edu.co',
  roleId: 3,
  isActive: true,
};

export const LIST_PROFESSORS_RESPONSE_EXAMPLE = {
  data: [
    {
      id: 'uuid-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      roleId: 3,
      isActive: true,
    },
  ],
  metadata: {
    totalItems: 1,
    itemsOnCurrentPage: 1,
    currentPage: 1,
    itemsPerPage: 25,
    totalPages: 1,
  },
};

export const MY_SUBJECTS_RESPONSE_EXAMPLE = [
  {
    id: 1,
    name: 'Algoritmia y Programación I',
    code: 'IST1234',
    semester: 1,
    nrcs: [
      { id: 1, code: 2496, isActive: true },
      { id: 2, code: 2498, isActive: true },
    ],
  },
  {
    id: 2,
    name: 'Estructura de Datos I',
    code: 'IST2050',
    semester: 3,
    nrcs: [{ id: 3, code: 5025, isActive: true }],
  },
];

export const NRC_REPORT_BY_ID_RESPONSE_EXAMPLE = {
  filter: {
    nrcId: 3,
    nrcCode: 2501,
    editionId: 1,
    year: 2025,
    semester: 10,
  },
  data: [
    {
      teamCode: 'D25N2501-01',
      nrc: '2501',
      team: 'Demo 2025 NRC 2501 - Mision Naturaleza',
      subject: 'Colegios',
      integrantes: 'Isabella Mora',
      videogame: 'Mision Naturaleza',
      calificacionFeria: null,
      calificacionDocente: null,
      videogameId: 1,
      editionId: 1,
      nrcId: 3,
    },
  ],
  metadata: {
    totalItems: 1,
    itemsOnCurrentPage: 1,
    currentPage: 1,
    itemsPerPage: 20,
    totalPages: 1,
  },
};

export const NRC_REPORT_BY_CODE_RESPONSE_EXAMPLE = {
  data: [
    {
      teamCode: 'N1-IST-101',
      nrc: '2498, 2496',
      team: 'Warriors',
      subject: 'Algoritmia y Programación I',
      integrantes: 'Camilo Gómez, Laura Mendoza, Valentina Ramírez',
      videogame: 'Stella',
      calificacionFeria: 4.8,
      calificacionDocente: 4.8,
      videogameId: 24,
    },
  ],
  metadata: {
    totalItems: 1,
    itemsOnCurrentPage: 1,
    currentPage: 1,
    itemsPerPage: 20,
    totalPages: 1,
  },
};

export const JUROR_EVALUATIONS_RESPONSE_EXAMPLE = {
  data: [
    {
      teamCode: 'ABC-123',
      nrc: '2496',
      team: 'Warriors',
      subject: 'Algoritmia y Programación I',
      integrantes: 'Camilo Gómez, Laura Mendoza',
      videogame: 'Stella',
      calificacionFeria: 4.5,
      calificacionDocente: null,
      videogameId: 24,
      isExternal: false,
    },
  ],
  metadata: {
    totalItems: 1,
    itemsOnCurrentPage: 1,
    currentPage: 1,
    itemsPerPage: 20,
    totalPages: 1,
  },
};

export const SIGNATURE_REPORT_RESPONSE_EXAMPLE = {
  data: [
    {
      teamCode: 'N1-IST-101',
      nrc: '2498',
      team: 'Nebula',
      subject: 'Algoritmia y Programación I',
      integrantes: 'Natalia Suárez, Julián Castro, Mariana Ortiz',
      videogame: 'Nebula Clash',
      calificacionFeria: 5,
      calificacionDocente: 5,
      videogameId: 25,
    },
    {
      teamCode: 'N1-IST-101',
      nrc: '2496, 2498',
      team: 'Warriors',
      subject: 'Algoritmia y Programación I',
      integrantes: 'Valentina Ramírez, Camilo Gómez, Laura Mendoza',
      videogame: 'Stella',
      calificacionFeria: 4.8,
      calificacionDocente: 4.8,
      videogameId: 24,
    },
  ],
  metadata: {
    totalItems: 2,
    itemsOnCurrentPage: 2,
    currentPage: 1,
    itemsPerPage: 20,
    totalPages: 1,
  },
};

export const TEAM_EVALUATION_REQUEST_EXAMPLES = {
  updateExample: {
    summary: 'Update example',
    value: { videogameId: 24, score: 4.7, isSenior: true },
  },
  upsertExample: {
    summary: 'Upsert (create) example',
    value: { videogameId: 27, score: 4.5, isSenior: true },
  },
};

export const TEAM_EVALUATION_CREATED_EXAMPLE = {
  action: 'created',
  evaluation: {
    id: 11,
    date: '2025-11-14T06:12:40.992Z',
    comments: null,
    totalScore: 4.5,
    jurorId: 'f777c17a-3390-4830-bf21-fb92235a679b',
    videogameId: 27,
    editionId: 2,
    isSenior: true,
    isActive: true,
  },
};

export const TEAM_EVALUATION_UPDATED_EXAMPLE = {
  action: 'updated',
  evaluation: {
    id: 1,
    date: '2025-11-08T22:57:51.792Z',
    comments: null,
    totalScore: 4.7,
    jurorId: 'f777c17a-3390-4830-bf21-fb92235a679b',
    videogameId: 24,
    editionId: 2,
    isSenior: true,
    isActive: true,
  },
};

export const PROFESSOR_RESPONSE_EXAMPLE = {
  id: 'uuid-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  roleId: 3,
  isActive: true,
};

export const UPDATED_PROFESSOR_RESPONSE_EXAMPLE = {
  id: 'uuid-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  roleId: 3,
  isActive: true,
};

export const BATCH_TEAM_EVALUATION_RESPONSE_EXAMPLE = {
  results: [
    { videogameId: 24, success: true },
    {
      videogameId: 25,
      success: false,
      message: 'Score must be between 0 and 5, with at most two decimal places',
    },
  ],
};

export const SELECT_OPTIONS_RESPONSE_EXAMPLE = [
  { id: 'uuid-1', label: 'John Doe' },
];
