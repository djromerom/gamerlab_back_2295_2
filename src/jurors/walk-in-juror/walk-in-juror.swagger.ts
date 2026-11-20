/** HU-24 (ARK-217): ejemplos largos de Swagger, fuera del controlador (convención de TA-14). */

export const EXISTING_PERSON_EXAMPLE = {
  id: 'd4e5f6a7-b8c9-4123-d456-678901234567',
  name: 'Laura Gómez Ruiz',
  role: 'Jurado',
  isActive: true,
  isJurorOfEdition: true,
  editionStatus: 'CONFIRMED',
  checkedInAt: null,
};

export const WALK_IN_CREATED_EXAMPLE = {
  juror: {
    id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
    name: 'Laura Gómez Ruiz',
    email: 'laura.gomez@ejemplo.com',
    category: 'JUNIOR',
    type: 'BACKUP',
  },
  edition: { id: 5, title: 'ARKAD 2026-30' },
  attendance: { checkedInAt: '2026-11-26T14:12:05.000Z', method: 'MANUAL' },
  walkIn: true,
};

const suggested = (
  id: number,
  codigo: string,
  nombre: string,
  juradosContados: number,
) => ({
  id,
  codigo,
  nombre,
  videojuego: `Juego ${nombre}`,
  juradosContados,
  faltantes: 3 - juradosContados,
});

export const TEAM_SUGGESTION_EXAMPLE = {
  edition: { id: 5, title: 'ARKAD 2026-30' },
  phase: 'CONTROL',
  basis: 'PRESENT',
  maxTeams: 3,
  level: 2,
  levelLabel: 'Nivel 2',
  teams: [
    suggested(21, 'N2-ED-03', 'Byte Me', 0),
    suggested(24, 'N2-ED-07', 'Code Knights', 1),
    suggested(25, 'N2-ED-08', 'Pixel Hunters', 1),
  ],
  otherTeamsOfLevel: [suggested(29, 'N2-ED-11', 'Lag Free', 2)],
  levels: [
    { level: 1, faltantes: 3, gruposConFaltantes: 2 },
    { level: 2, faltantes: 6, gruposConFaltantes: 4 },
  ],
  reason: null,
};

export const WALK_IN_ASSIGNMENT_EXAMPLE = {
  message: 'Se asignaron 3 grupos a Laura Gómez Ruiz. Nadie perdió grupos.',
  edicion: { id: 5, title: 'ARKAD 2026-30' },
  jurado: {
    id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
    nombre: 'Laura Gómez Ruiz',
  },
  equiposAgregados: [
    { id: 21, codigo: 'N2-ED-03', nombre: 'Byte Me' },
    { id: 24, codigo: 'N2-ED-07', nombre: 'Code Knights' },
    { id: 25, codigo: 'N2-ED-08', nombre: 'Pixel Hunters' },
  ],
  equiposYaAsignados: [],
  advertenciasAceptadas: [],
};
