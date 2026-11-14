import { byLevelThenName, teamLevelInfo, teamLevelLabel } from './team-level';

describe('Nivel del equipo para la asignación manual (BG-39)', () => {
  it.each([
    ['N1-IST-101', 1, 'Nivel 1'],
    ['n2-abc-1', 2, 'Nivel 2'],
    ['N10-ABC-1001', 10, 'Nivel 10'],
    ['N0-ABC-001', 0, 'Colegios'],
    ['EXT-01', null, 'Sin nivel'],
  ])('%s -> %p (%s)', (teamCode, nivel, nivelEtiqueta) => {
    expect(teamLevelInfo(teamCode)).toEqual({ teamCode, nivel, nivelEtiqueta });
  });

  it('etiqueta', () => {
    expect(teamLevelLabel(3)).toBe('Nivel 3');
  });

  it('ordena por nivel, luego por nombre sin distinguir tildes; sin nivel al final', () => {
    const teams = [
      { nombre: 'Zeta', nivel: 2 },
      { nombre: 'sin', nivel: null },
      { nombre: 'Beta', nivel: 1 },
      { nombre: 'Álamo', nivel: 1 },
      { nombre: 'Colegio', nivel: 0 },
    ];
    expect([...teams].sort(byLevelThenName).map((t) => t.nombre)).toEqual([
      'Colegio',
      'Álamo',
      'Beta',
      'Zeta',
      'sin',
    ]);
  });
});
