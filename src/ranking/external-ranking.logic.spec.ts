import {
  DecisionRef,
  ScoreRow,
  TeamInfo,
  buildLevelRankings,
  buildTieKey,
} from './ranking.logic';
import {
  buildExternalRanking,
  rankingGroupKey,
} from './external-ranking.logic';

/** HU-38 (ARK-219): el grupo «Externos», con su propio podio. */
const EDITION = 7;
const prof = { id: 'pa', name: 'Ana Prof' };

let nextVg = 500;
const row = (
  teamId: number,
  teamCode: string,
  finalScore: number | null,
  extra: Partial<ScoreRow> = {},
): ScoreRow => ({
  teamId,
  teamCode,
  teamName: `Equipo ${teamId}`,
  isExternal: false,
  videogameId: nextVg++,
  videogameName: `Juego ${teamId}`,
  videogameLogoUrl: null,
  editionId: EDITION,
  avgJunior: finalScore,
  avgSenior: finalScore,
  finalScore,
  juniorEvaluations: 3,
  juniorCounted: 3,
  seniorEvaluations: 1,
  weightingConfigured: true,
  ...extra,
});
const ext = (teamId: number, teamCode: string, score: number | null) =>
  row(teamId, teamCode, score, { isExternal: true, seniorEvaluations: 0 });

const info = (day: number, isActive = true): TeamInfo => ({
  registrationDate: new Date(Date.UTC(2026, 10, day, 12)),
  isActive,
  professors: [prof],
});

const input = (
  rows: ScoreRow[],
  days: Record<number, number>,
  extra: {
    decisions?: DecisionRef[];
    podiumSize?: number;
    inactive?: number[];
  } = {},
) => ({
  editionId: EDITION,
  rows,
  teams: new Map(
    Object.entries(days).map(([id, day]) => [
      Number(id),
      info(day, !extra.inactive?.includes(Number(id))),
    ]),
  ),
  decisions: new Map((extra.decisions ?? []).map((d) => [d.tieKey, d])),
  podiumSize: extra.podiumSize,
});

describe('grupo Externos (HU-38)', () => {
  it('un externo no compite en su nivel: el podio de N1 es solo de los no externos', () => {
    const data = input(
      [row(1, 'N1-A-1', 4), row(2, 'N1-A-2', 3.5), ext(3, 'N1-X-3', 4.9)],
      { 1: 1, 2: 2, 3: 3 },
    );

    const [n1] = buildLevelRankings(data);
    const external = buildExternalRanking(data)!;

    expect(n1.podium.map((t) => t.teamId)).toEqual([1, 2]);
    expect(n1.teams.some((t) => t.isExternal)).toBe(false);
    expect(external).toMatchObject({
      level: null,
      external: true,
      label: 'Externos',
    });
    expect(external.podium.map((t) => [t.teamId, t.position])).toEqual([
      [3, 1],
    ]);
  });

  it('los externos de distintos niveles compiten juntos, con podio configurable', () => {
    const external = buildExternalRanking(
      input(
        [
          ext(1, 'N1-X-1', 3),
          ext(2, 'N3-X-2', 4.5),
          ext(3, 'N2-X-3', 4),
          ext(4, 'N4-X-4', 2),
        ],
        { 1: 1, 2: 2, 3: 3, 4: 4 },
        { podiumSize: 2 },
      ),
    )!;
    expect(external.teams.map((t) => t.teamId)).toEqual([2, 3, 1, 4]);
    expect(external.podium.map((t) => t.teamId)).toEqual([2, 3]);
  });

  it('un colegio (N0) con la marca de externo sigue en su nivel', () => {
    const data = input([row(1, 'N0-C-1', 4, { isExternal: true })], { 1: 1 });
    expect(buildExternalRanking(data)).toBeNull();
    expect(buildLevelRankings(data)[0]).toMatchObject({
      level: 0,
      external: false,
    });
  });

  it('un empate entre externos usa las mismas reglas, con clave propia', () => {
    const external = buildExternalRanking(
      input([ext(1, 'N1-X-1', 4.2), ext(2, 'N2-X-2', 4.2)], { 1: 5, 2: 3 }),
    )!;
    expect(external.ties).toHaveLength(1);
    expect(external.ties[0]).toMatchObject({
      level: null,
      external: true,
      rule: 'PROFESSOR',
      status: 'PENDING',
      order: [2, 1], // provisional: primero el inscrito antes
      affectsPodium: true,
      tieKey: buildTieKey(EDITION, null, 4.2, [1, 2]),
    });
    expect(external.ties[0].tieKey).toBe(`${EDITION}:EXT:4.20:1,2`);
  });

  it('una decisión registrada ordena el empate de externos', () => {
    const tieKey = buildTieKey(EDITION, null, 4.2, [1, 2]);
    const external = buildExternalRanking(
      input(
        [ext(1, 'N1-X-1', 4.2), ext(2, 'N2-X-2', 4.2)],
        { 1: 5, 2: 3 },
        {
          decisions: [
            {
              id: 1,
              tieKey,
              method: 'PROFESSOR',
              reason: 'Mejor demo',
              orderedTeamIds: [1, 2],
              decidedBy: prof,
              decidedAt: new Date(),
            },
          ],
        },
      ),
    )!;
    expect(external.ties[0].status).toBe('RESOLVED');
    expect(external.teams.map((t) => t.teamId)).toEqual([1, 2]);
  });

  it('sin nota van a la lista de incompletos; inactivos y de otra edición no entran', () => {
    const external = buildExternalRanking(
      input(
        [
          ext(1, 'N1-X-1', 4),
          { ...ext(2, 'N1-X-2', null), juniorEvaluations: 0, juniorCounted: 0 },
          ext(3, 'N1-X-3', 5),
          { ...ext(4, 'N1-X-4', 5), editionId: 99 },
        ],
        { 1: 1, 2: 2, 3: 3, 4: 4 },
        { inactive: [3] },
      ),
    )!;
    expect(external.teams.map((t) => t.teamId)).toEqual([1]);
    expect(external.withoutScore).toEqual([
      {
        teamId: 2,
        teamCode: 'N1-X-2',
        teamName: 'Equipo 2',
        missing: ['JUROR'],
      },
    ]);
  });

  it('sin equipos externos no hay grupo', () => {
    expect(
      buildExternalRanking(input([row(1, 'N1-A-1', 4)], { 1: 1 })),
    ).toBeNull();
  });

  it('rankingGroupKey: nivel o EXT', () => {
    expect(rankingGroupKey({ teamCode: 'N2-A-1', isExternal: false })).toBe(
      'N2',
    );
    expect(rankingGroupKey({ teamCode: 'N2-A-1', isExternal: true })).toBe(
      'EXT',
    );
    expect(rankingGroupKey({ teamCode: 'N0-C-1', isExternal: true })).toBe(
      'N0',
    );
    expect(
      rankingGroupKey({ teamCode: 'SIN-NIVEL', isExternal: true }),
    ).toBeNull();
  });
});
