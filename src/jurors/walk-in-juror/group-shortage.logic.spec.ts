import { planGroupShortage, ShortageTeamInput } from './group-shortage.logic';

let nextId = 1;
const team = (
  teamCode: string,
  countedJurors: number,
  level: number | null = Number(/^N(\d+)-/.exec(teamCode)?.[1] ?? NaN),
): ShortageTeamInput => ({
  id: nextId++,
  teamCode,
  teamName: `Equipo ${teamCode}`,
  videogame: null,
  level: Number.isNaN(level) ? null : level,
  countedJurors,
});
const plan = (teams: ShortageTeamInput[], maxTeams = 3) =>
  planGroupShortage(teams, { maxTeams, required: 3 });
const codes = (list: { codigo: string }[]) => list.map((t) => t.codigo);

describe('HU-24: grupos que se le proponen al suplente', () => {
  it('elige el nivel con más jurados faltantes sumando todos sus grupos', () => {
    const result = plan([
      team('N1-A', 0), // 3
      team('N2-A', 1), // 2
      team('N2-B', 1), // 2  → N2 suma 4
      team('N3-A', 2), // 1
    ]);

    expect(result.level).toBe(2);
    expect(codes(result.teams)).toEqual(['N2-A', 'N2-B']);
    expect(result.levels).toEqual([
      { level: 1, faltantes: 3, gruposConFaltantes: 1 },
      { level: 2, faltantes: 4, gruposConFaltantes: 2 },
      { level: 3, faltantes: 1, gruposConFaltantes: 1 },
    ]);
  });

  it('empate en faltantes: gana el nivel con más grupos con faltantes', () => {
    const result = plan([
      team('N1-A', 0), // N1: 3 faltantes en 1 grupo
      team('N3-A', 2),
      team('N3-B', 1), // N3: 3 faltantes en 2 grupos
    ]);

    expect(result.level).toBe(3);
  });

  it('empate total: gana el nivel más bajo', () => {
    const result = plan([team('N4-A', 1), team('N2-A', 1)]);

    expect(result.level).toBe(2);
  });

  it('dentro del nivel, primero a los que más les faltan, luego por código, hasta el tope', () => {
    const result = plan([
      team('N1-D', 2),
      team('N1-C', 0),
      team('N1-B', 1),
      team('N1-A', 1),
      team('N1-E', 0),
    ]);

    expect(codes(result.teams)).toEqual(['N1-C', 'N1-E', 'N1-A']);
    expect(codes(result.otherTeamsOfLevel)).toEqual(['N1-B', 'N1-D']);
    expect(result.teams.map((t) => t.faltantes)).toEqual([3, 3, 2]);
  });

  it('respeta un tope distinto de 3', () => {
    const teams = [team('N1-A', 0), team('N1-B', 0), team('N1-C', 0)];

    expect(codes(plan(teams, 1).teams)).toEqual(['N1-A']);
    expect(plan(teams, 1).otherTeamsOfLevel).toHaveLength(2);
  });

  it('si el nivel tiene menos grupos que el tope no completa con otro nivel', () => {
    const result = plan([
      team('N2-A', 0),
      team('N2-B', 0),
      team('N1-A', 2),
      team('N3-A', 2),
    ]);

    expect(result.level).toBe(2);
    expect(codes(result.teams)).toEqual(['N2-A', 'N2-B']);
    expect(result.otherTeamsOfLevel).toEqual([]);
  });

  it('excluye los colegios (N0) y los equipos sin nivel, aunque tengan más faltantes', () => {
    const result = plan([
      team('N0-A', 0),
      team('N0-B', 0),
      team('XX-A', 0, null),
      team('N3-A', 2),
    ]);

    expect(result.level).toBe(3);
    expect(codes(result.teams)).toEqual(['N3-A']);
    expect(result.levels.map((l) => l.level)).toEqual([3]);
  });

  it('ignora los grupos completos o con más jurados de los necesarios', () => {
    const result = plan([team('N1-A', 3), team('N1-B', 5), team('N2-A', 2)]);

    expect(result.level).toBe(2);
    expect(result.levels).toEqual([
      { level: 2, faltantes: 1, gruposConFaltantes: 1 },
    ]);
  });

  it('sin grupos con faltantes no propone nada', () => {
    expect(plan([team('N1-A', 3), team('N0-A', 0)])).toEqual({
      level: null,
      teams: [],
      otherTeamsOfLevel: [],
      levels: [],
    });
    expect(plan([])).toMatchObject({ level: null, teams: [] });
  });

  it('devuelve los datos que muestra la lista previa', () => {
    const [proposed] = plan([
      { ...team('N1-AYP-06', 1), teamName: 'Pixel', videogame: 'Run' },
    ]).teams;

    expect(proposed).toEqual({
      id: expect.any(Number),
      codigo: 'N1-AYP-06',
      nombre: 'Pixel',
      videojuego: 'Run',
      juradosContados: 1,
      faltantes: 2,
    });
  });
});
