import { toPublicPodium } from './public-podium';

/** HU-48 (ARK-306): el ranking público solo lleva el podio de cada nivel y ninguna nota. */
describe('toPublicPodium (HU-48)', () => {
  const row = (
    teamId: number,
    teamCode: string | null,
    levelPosition: number | null,
  ) => ({
    teamId,
    teamCode,
    teamName: `Equipo ${teamId}`,
    isExternal: false,
    videogameId: teamId * 10,
    videogameName: `Juego ${teamId}`,
    logoUrl: `logo-${teamId}`,
    videogameLogoUrl: `vg-${teamId}`,
    editionId: 3,
    finalScore: 4.5,
    avgJunior: 4,
    avgSenior: 5,
    rankingScore: 4.5,
    tieBreakerScore: null,
    juniorEvaluations: 3,
    juniorCounted: 3,
    seniorEvaluations: 1,
    weightingConfigured: true,
    wasTied: false,
    tiePending: false,
    position: teamId,
    levelPosition,
  });

  it('deja solo los 3 primeros de cada nivel, ordenados por nivel y puesto', () => {
    const out = toPublicPodium([
      row(1, 'N2-A-1', 1),
      row(2, 'N1-A-2', 2),
      row(3, 'N1-A-3', 4),
      row(4, 'N1-A-4', 1),
      row(5, 'N2-A-5', 3),
      row(6, 'N1-A-6', 3),
      row(7, 'N2-A-7', 2),
      row(8, 'N2-A-8', 5),
    ]);
    expect(out.map((r) => [r.level, r.levelPosition, r.teamId])).toEqual([
      [1, 1, 4],
      [1, 2, 2],
      [1, 3, 6],
      [2, 1, 1],
      [2, 2, 7],
      [2, 3, 5],
    ]);
  });

  it('no envía ninguna nota ni puntaje, solo la lista blanca de campos', () => {
    const [r] = toPublicPodium([row(1, 'N1-A-1', 1)]);
    expect(r).toEqual({
      teamId: 1,
      teamCode: 'N1-A-1',
      teamName: 'Equipo 1',
      isExternal: false,
      videogameId: 10,
      videogameName: 'Juego 1',
      logoUrl: 'logo-1',
      videogameLogoUrl: 'vg-1',
      editionId: 3,
      level: 1,
      levelPosition: 1,
      position: 1,
    });
  });

  it('un nivel con menos de 3 equipos con nota muestra solo los que hay', () => {
    expect(toPublicPodium([row(1, 'N0-C-1', 1)])).toHaveLength(1);
  });

  it('deja fuera las filas sin puesto (sin nota) o sin nivel en el código', () => {
    expect(
      toPublicPodium([
        row(1, 'N1-A-1', null),
        row(2, 'SIN-NIVEL', 1),
        row(3, null, 1),
        row(4, 'N1-A-4', 0),
      ]),
    ).toEqual([]);
  });

  it('sin logoUrl usa el logo del videojuego', () => {
    const [r] = toPublicPodium([{ ...row(1, 'N1-A-1', 1), logoUrl: null }]);
    expect(r.logoUrl).toBe('vg-1');
  });

  it('respeta otro tamaño de podio', () => {
    expect(
      toPublicPodium(
        [row(1, 'N1-A-1', 1), row(2, 'N1-A-2', 2), row(3, 'N1-A-3', 3)],
        2,
      ).map((r) => r.teamId),
    ).toEqual([1, 2]);
  });
});
