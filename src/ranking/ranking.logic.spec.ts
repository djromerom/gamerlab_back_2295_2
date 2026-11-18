import {
  DecisionRef,
  ScoreRow,
  TeamInfo,
  buildLevelRankings,
  buildTieKey,
  classifyTie,
  parseLevel,
  teamsWithoutLevel,
  validateOrder,
} from './ranking.logic';
import { buildExternalRanking } from './external-ranking.logic';

const EDITION = 7;
const profA = { id: 'pa', name: 'Ana Prof' };
const profB = { id: 'pb', name: 'Beto Prof' };

let nextVg = 100;
function row(
  teamId: number,
  teamCode: string,
  finalScore: number | null,
  extra: Partial<ScoreRow> = {},
): ScoreRow {
  return {
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
  };
}

function info(day: number, professors = [profA], isActive = true): TeamInfo {
  return {
    registrationDate: new Date(Date.UTC(2026, 10, day, 12, 0, 0)),
    isActive,
    professors,
  };
}

function build(
  rows: ScoreRow[],
  teams: Record<number, TeamInfo>,
  decisions: DecisionRef[] = [],
  podiumSize?: number,
) {
  return buildLevelRankings({
    editionId: EDITION,
    rows,
    teams: new Map(Object.entries(teams).map(([k, v]) => [Number(k), v])),
    decisions: new Map(decisions.map((d) => [d.tieKey, d])),
    podiumSize,
  });
}

describe('ranking.logic (HU-04)', () => {
  describe('parseLevel', () => {
    it.each([
      ['N2-ABC-201', 2],
      ['n0-col-1', 0],
      ['N10-ABC-1001', 10],
      [' N3-X-1 ', 3],
      ['ABC-1', null],
      ['N-1', null],
      [null, null],
    ])('%s → %s', (code, level) => {
      expect(parseLevel(code as any)).toBe(level);
    });
  });

  it('separa por nivel, ordena por nota y numera dentro del nivel', () => {
    const levels = build(
      [
        row(1, 'N1-A-1', 4.1),
        row(2, 'N1-A-2', 4.5),
        row(3, 'N2-A-1', 3.9),
        row(4, 'N1-A-3', 3.2),
      ],
      { 1: info(1), 2: info(2), 3: info(3), 4: info(4) },
    );
    expect(levels.map((l) => l.label)).toEqual(['N1', 'N2']);
    expect(levels[0].teams.map((t) => [t.teamId, t.position])).toEqual([
      [2, 1],
      [1, 2],
      [4, 3],
    ]);
    expect(levels[1].teams.map((t) => [t.teamId, t.position])).toEqual([
      [3, 1],
    ]);
    expect(levels[0].ties).toEqual([]);
  });

  it('el podio es de 3 por defecto y se puede cambiar', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => row(i, `N1-A-${i}`, 5 - i / 10));
    const teams = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [i, info(i)]));
    expect(build(rows, teams)[0].podium.map((t) => t.teamId)).toEqual([
      1, 2, 3,
    ]);
    expect(build(rows, teams, [], 1)[0].podium.map((t) => t.teamId)).toEqual([
      1,
    ]);
  });

  it('deja fuera equipos inactivos, de otra edición o sin nivel, y lista aparte los que no tienen nota', () => {
    const levels = build(
      [
        row(1, 'N1-A-1', 4),
        row(2, 'N1-A-2', 4.8),
        row(3, 'N1-A-3', 4.9, { editionId: 99 }),
        row(4, 'SIN-NIVEL', 5),
        row(5, 'N1-A-5', null, { juniorEvaluations: 0, seniorEvaluations: 1 }),
      ],
      {
        1: info(1),
        2: info(2, [profA], false),
        3: info(3),
        4: info(4),
        5: info(5),
      },
    );
    expect(levels).toHaveLength(1);
    expect(levels[0].teams.map((t) => t.teamId)).toEqual([1]);
    expect(levels[0].withoutScore).toEqual([
      {
        teamId: 5,
        teamCode: 'N1-A-5',
        teamName: 'Equipo 5',
        missing: ['JUROR'],
      },
    ]);
  });

  it('la lista de incompletos dice qué parte le falta a cada equipo según lo que cuenta en su nota', () => {
    const empty = { juniorEvaluations: 0, seniorEvaluations: 0 };
    const [n0, n1] = build(
      [
        row(1, 'N0-C-1', null, empty),
        row(2, 'N0-C-2', null, { ...empty, isExternal: true }),
        row(3, 'N1-A-3', null, empty),
        row(4, 'N1-A-4', null, { juniorEvaluations: 2, seniorEvaluations: 0 }),
        row(5, 'N1-A-5', null, { ...empty, isExternal: true }),
      ],
      { 1: info(1), 2: info(2), 3: info(3), 4: info(4), 5: info(5) },
    );
    const missingOf = (level: typeof n0) =>
      level.withoutScore.map((t) => [t.teamId, t.missing]);

    expect(missingOf(n0)).toEqual([
      [1, ['PROFESSOR']],
      [2, ['PROFESSOR']],
    ]);
    expect(missingOf(n1)).toEqual([
      [3, ['PROFESSOR', 'JUROR']],
      [4, ['PROFESSOR']],
    ]);
    // HU-38: el externo N1 sale de su nivel y va al grupo Externos; ahí solo le falta la de jurados
    const external = buildExternalRanking({
      editionId: EDITION,
      rows: [row(5, 'N1-A-5', null, { ...empty, isExternal: true })],
      teams: new Map([[5, info(5)]]),
      decisions: new Map(),
    });
    expect(external && missingOf(external)).toEqual([[5, ['JUROR']]]);
  });

  it('a un colegio (N0) no se le marcan evaluaciones de jurado faltantes', () => {
    const [level] = build(
      [
        row(1, 'N0-C-1', 4.5, { juniorEvaluations: 0, juniorCounted: 0 }),
        row(2, 'N0-C-2', 4, {
          juniorEvaluations: 0,
          juniorCounted: 0,
          isExternal: true,
        }),
      ],
      { 1: info(1), 2: info(2) },
    );
    for (const team of level.teams) {
      expect(team).toMatchObject({
        lessThanMinEvaluations: false,
        missingProfessorScore: false,
      });
    }
  });

  it('teamsWithoutLevel devuelve los equipos activos de la edición cuyo código no indica nivel', () => {
    const rows = [
      row(1, 'N1-A-1', 4),
      row(4, 'SIN-NIVEL', 5),
      row(6, 'X-6', null),
      row(7, 'OTRO', 3, { editionId: 99 }),
      row(8, 'INACTIVO', 3),
    ];
    const teams = new Map<number, TeamInfo>([
      [1, info(1)],
      [4, info(4)],
      [6, info(6)],
      [7, info(7)],
      [8, info(8, [profA], false)],
    ]);
    expect(teamsWithoutLevel({ editionId: EDITION, rows, teams })).toEqual([
      { teamId: 4, teamCode: 'SIN-NIVEL', teamName: 'Equipo 4' },
      { teamId: 6, teamCode: 'X-6', teamName: 'Equipo 6' },
    ]);
  });

  it('BG-68 (ARK-270): el mínimo de 3 cuenta las evaluaciones de jurados junior y senior', () => {
    const [level] = build(
      [
        row(1, 'N1-A-1', 4, { juniorEvaluations: 2, seniorEvaluations: 1 }),
        row(2, 'N1-A-2', 4, { juniorEvaluations: 1, seniorEvaluations: 2 }),
        row(3, 'N1-A-3', 4, { juniorEvaluations: 3, seniorEvaluations: 0 }),
        row(4, 'N1-A-4', 4, { juniorEvaluations: 1, seniorEvaluations: 1 }),
        row(5, 'N1-A-5', 4, { juniorEvaluations: 0, seniorEvaluations: 2 }),
      ],
      { 1: info(1), 2: info(2), 3: info(3), 4: info(4), 5: info(5) },
    );
    const flagged = (code: string) =>
      level.teams.find((t) => t.teamCode === code)?.lessThanMinEvaluations;
    // Suman 3: no se marca
    expect(flagged('N1-A-1')).toBe(false);
    expect(flagged('N1-A-2')).toBe(false);
    expect(flagged('N1-A-3')).toBe(false);
    // Suman menos de 3: se marca
    expect(flagged('N1-A-4')).toBe(true);
    expect(flagged('N1-A-5')).toBe(true);
  });

  it('BG-68 (ARK-270): un colegio (N0) sigue sin marcarse, tenga las evaluaciones que tenga', () => {
    const [colegios] = build(
      [row(1, 'N0-C-1', 4, { juniorEvaluations: 0, seniorEvaluations: 1 })],
      { 1: info(1) },
    );
    expect(colegios.teams[0].lessThanMinEvaluations).toBe(false);
  });

  it('marca menos de 3 evaluaciones, evaluaciones que no cuentan y falta de nota del profesor', () => {
    const [level] = build(
      [
        // 1 junior + 1 senior (por defecto): suman 2, menos de 3 (BG-68)
        row(1, 'N1-A-1', 4, { juniorEvaluations: 1, juniorCounted: 1 }),
        row(2, 'N1-A-2', 3.5, {
          juniorEvaluations: 5,
          juniorCounted: 3,
          seniorEvaluations: 0,
        }),
      ],
      { 1: info(1), 2: info(2) },
    );
    const [t1, t2] = level.teams;
    expect(t1).toMatchObject({
      lessThanMinEvaluations: true,
      juniorNotCounted: 0,
      missingProfessorScore: false,
    });
    expect(t2).toMatchObject({
      lessThanMinEvaluations: false,
      juniorNotCounted: 2,
      missingProfessorScore: true,
    });
    // Los externos no llevan nota del profesor (HU-38: van en su propio grupo)
    const external = buildExternalRanking({
      editionId: EDITION,
      rows: [row(3, 'N1-A-3', 3, { isExternal: true, seniorEvaluations: 0 })],
      teams: new Map([[3, info(3)]]),
      decisions: new Map(),
    });
    expect(external?.teams[0].missingProfessorScore).toBe(false);
  });

  describe('empates (P-05)', () => {
    it('mismo profesor: queda pendiente para ese profesor, con orden provisional por inscripción', () => {
      const [level] = build(
        [row(1, 'N1-A-1', 4.2), row(2, 'N1-A-2', 4.2), row(3, 'N1-A-3', 4.5)],
        { 1: info(5, [profA]), 2: info(3, [profA, profB]), 3: info(1) },
      );
      expect(level.ties).toHaveLength(1);
      const tie = level.ties[0];
      expect(tie).toMatchObject({
        rule: 'PROFESSOR',
        status: 'PENDING',
        deciders: [profA],
        positions: [2, 3],
        affectsPodium: true,
        order: [2, 1],
        tieKey: buildTieKey(EDITION, 1, 4.2, [1, 2]),
      });
      expect(
        level.teams.map((t) => [t.teamId, t.position, t.provisional]),
      ).toEqual([
        [3, 1, false],
        [2, 2, true],
        [1, 3, true],
      ]);
    });

    it('profesores distintos: gana la inscripción más antigua, sin decisión', () => {
      const [level] = build([row(1, 'N1-A-1', 4), row(2, 'N1-A-2', 4)], {
        1: info(9, [profA]),
        2: info(2, [profB]),
      });
      expect(level.ties[0]).toMatchObject({
        rule: 'REGISTRATION',
        status: 'RESOLVED',
        order: [2, 1],
      });
      expect(level.ties[0].explanation).toContain('Criterio de inscripción');
      expect(level.teams.map((t) => t.teamId)).toEqual([2, 1]);
      expect(level.teams.every((t) => !t.provisional)).toBe(true);
    });

    it('si el empate mezcla grupos del mismo profesor con otros, se aplica la inscripción', () => {
      const [level] = build(
        [row(1, 'N1-A-1', 4), row(2, 'N1-A-2', 4), row(3, 'N1-A-3', 4)],
        { 1: info(3, [profA]), 2: info(1, [profA]), 3: info(2, [profB]) },
      );
      expect(level.ties[0]).toMatchObject({
        rule: 'REGISTRATION',
        order: [2, 3, 1],
      });
    });

    it('equipos sin profesor (colegios) también van por inscripción', () => {
      const [level] = build([row(1, 'N0-C-1', 4), row(2, 'N0-C-2', 4)], {
        1: info(3, []),
        2: info(1, []),
      });
      expect(level.ties[0]).toMatchObject({
        rule: 'REGISTRATION',
        order: [2, 1],
      });
    });

    it('misma fecha de inscripción sin profesor común: queda para el administrador', () => {
      const [level] = build([row(1, 'N1-A-1', 4), row(2, 'N1-A-2', 4)], {
        1: info(3, [profA]),
        2: info(3, [profB]),
      });
      expect(level.ties[0]).toMatchObject({
        rule: 'MANUAL',
        status: 'PENDING',
      });
    });

    it('aplica la decisión registrada para esa clave de empate', () => {
      const tieKey = buildTieKey(EDITION, 1, 4.2, [1, 2]);
      const decision: DecisionRef = {
        id: 1,
        tieKey,
        method: 'PROFESSOR',
        reason: 'Mejor jugabilidad',
        orderedTeamIds: [1, 2],
        decidedBy: profA,
        decidedAt: new Date(),
      };
      const [level] = build(
        [row(1, 'N1-A-1', 4.2), row(2, 'N1-A-2', 4.2)],
        { 1: info(5), 2: info(1) },
        [decision],
      );
      expect(level.ties[0]).toMatchObject({
        status: 'RESOLVED',
        order: [1, 2],
        explanation: 'Mejor jugabilidad',
      });
      expect(level.teams.map((t) => t.teamId)).toEqual([1, 2]);
    });

    it('una decisión de otro empate (otra nota u otros equipos) no se aplica', () => {
      const stale: DecisionRef = {
        id: 1,
        tieKey: buildTieKey(EDITION, 1, 4.1, [1, 2]),
        method: 'PROFESSOR',
        reason: 'x',
        orderedTeamIds: [1, 2],
        decidedBy: profA,
        decidedAt: new Date(),
      };
      const [level] = build(
        [row(1, 'N1-A-1', 4.2), row(2, 'N1-A-2', 4.2)],
        { 1: info(5), 2: info(1) },
        [stale],
      );
      expect(level.ties[0]).toMatchObject({
        status: 'PENDING',
        decision: null,
      });
    });

    it('un empate fuera del podio se detecta pero no afecta el podio', () => {
      const rows = [
        row(1, 'N1-A-1', 5),
        row(2, 'N1-A-2', 4.9),
        row(3, 'N1-A-3', 4.8),
        row(4, 'N1-A-4', 3),
        row(5, 'N1-A-5', 3),
      ];
      const teams = {
        1: info(1),
        2: info(2),
        3: info(3),
        4: info(4, [profA]),
        5: info(5, [profB]),
      };
      const [level] = build(rows, teams);
      expect(level.ties[0]).toMatchObject({
        positions: [4, 5],
        affectsPodium: false,
      });
    });

    it('compara la nota con 2 decimales', () => {
      const [level] = build([row(1, 'N1-A-1', 4.123), row(2, 'N1-A-2', 4.12)], {
        1: info(2, [profA]),
        2: info(1, [profB]),
      });
      expect(level.ties).toHaveLength(1);
      expect(level.teams.map((t) => t.finalScore)).toEqual([4.12, 4.12]);
    });
  });

  it('classifyTie da todos los profesores comunes como posibles decisores', () => {
    const t = (id: number, professors: any[]) => ({
      teamId: id,
      teamCode: `N1-${id}`,
      teamName: null,
      videogameName: null,
      registrationDate: new Date(Date.UTC(2026, 0, id)).toISOString(),
      professors,
    });
    expect(classifyTie([t(1, [profA, profB]), t(2, [profB, profA])])).toEqual({
      rule: 'PROFESSOR',
      deciders: [profA, profB],
    });
  });

  it('validateOrder exige exactamente los equipos empatados', () => {
    const [level] = build([row(1, 'N1-A-1', 4), row(2, 'N1-A-2', 4)], {
      1: info(1),
      2: info(2),
    });
    const tie = level.ties[0];
    expect(validateOrder(tie, [2, 1])).toBeNull();
    expect(validateOrder(tie, [1])).toContain('una sola vez');
    expect(validateOrder(tie, [1, 1])).toContain('una sola vez');
    expect(validateOrder(tie, [1, 3])).toContain('una sola vez');
  });
});
