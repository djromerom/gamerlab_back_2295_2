import { JurorCategory } from '@prisma/client';

import { extractTeamLevel } from '../assignment-validation/assignment-rules';
import { planAutomaticAssignment } from './automatic-assignment.planner';
import {
  AutoAssignmentPlan,
  PlannerEvaluator,
  PlannerInput,
  PlannerJuror,
  PlannerTeam,
} from './automatic-assignment.types';

const LIMITS = { maxTeamsPerJuror: 3, jurorsPerTeam: 3 };

function professor(id: string, managedNrcIds: number[] = []): PlannerJuror {
  return {
    id,
    name: `Prof ${id}`,
    kind: 'PROFESSOR',
    jurorCategory: null,
    managedNrcIds,
  };
}

function juror(
  id: string,
  category: JurorCategory | null = JurorCategory.JUNIOR,
): PlannerJuror {
  return {
    id,
    name: `Jurado ${id}`,
    kind: 'JUROR',
    jurorCategory: category,
    managedNrcIds: [],
  };
}

function team(
  id: number,
  teamCode: string,
  extra: Partial<PlannerTeam> = {},
): PlannerTeam {
  return {
    id,
    teamCode,
    teamName: `Equipo ${id}`,
    assignable: true,
    assigned: [],
    memberNrcIds: [],
    ...extra,
  };
}

const teamsOf = (level: number, count: number, firstId = 1) =>
  Array.from({ length: count }, (_, i) =>
    team(firstId + i, `N${level}-T-${String(i + 1).padStart(2, '0')}`),
  );

const many = (
  prefix: string,
  count: number,
  make: (id: string) => PlannerJuror,
) => Array.from({ length: count }, (_, i) => make(`${prefix}${i + 1}`));

function plan(
  teams: PlannerTeam[],
  jurors: PlannerJuror[],
  limits = LIMITS,
): AutoAssignmentPlan {
  return planAutomaticAssignment({ teams, jurors, limits });
}

/** Grupos finales por jurado (fijos + nuevos) y niveles. */
function loadsOf(input: PlannerInput, result: AutoAssignmentPlan) {
  const teamsById = new Map(input.teams.map((t) => [t.id, t]));
  const byJuror = new Map<string, number[]>();
  const add = (jurorId: string, teamId: number) =>
    byJuror.set(jurorId, [...(byJuror.get(jurorId) ?? []), teamId]);
  for (const t of input.teams) for (const e of t.assigned) add(e.id, t.id);
  for (const a of result.assignments) add(a.jurorId, a.teamId);

  return new Map(
    [...byJuror].map(([jurorId, teamIds]) => [
      jurorId,
      {
        teams: teamIds.length,
        levels: new Set(
          teamIds.map((id) => extractTeamLevel(teamsById.get(id)!.teamCode)),
        ),
      },
    ]),
  );
}

function expectRulesHold(input: PlannerInput, result: AutoAssignmentPlan) {
  for (const t of result.teams) {
    expect(t.jurors.length).toBeLessThanOrEqual(LIMITS.jurorsPerTeam);
    expect(new Set(t.jurors.map((j) => j.id)).size).toBe(t.jurors.length);
  }
  const newJurors = new Set(result.assignments.map((a) => a.jurorId));
  for (const [jurorId, load] of loadsOf(input, result)) {
    if (!newJurors.has(jurorId)) continue;
    expect(load.teams).toBeLessThanOrEqual(input.limits.maxTeamsPerJuror);
    expect(load.levels.size).toBe(1);
  }
}

describe('planAutomaticAssignment (HU-07)', () => {
  it('reparte 3 jurados por grupo y hasta 3 grupos por jurado, sin mezclar niveles', () => {
    const teams = [...teamsOf(1, 4, 1), ...teamsOf(2, 4, 11)];
    const jurors = [
      ...many('p', 3, (id) => professor(id)),
      ...many('j', 6, (id) => juror(id)),
    ];
    const input = { teams, jurors, limits: LIMITS };
    const result = planAutomaticAssignment(input);

    expectRulesHold(input, result);
    expect(result.summary.completeTeams).toBe(8);
    expect(result.summary.newAssignments).toBe(24);
    expect(result.alerts.filter((a) => a.code === 'TEAM_INCOMPLETE')).toEqual(
      [],
    );
  });

  it('equilibra la carga: 6 grupos y 9 jurados → 2 grupos cada uno', () => {
    const result = plan(
      teamsOf(1, 6),
      many('j', 9, (id) => juror(id)),
    );

    const loads = result.jurors.map((j) => j.teamsAfter);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
    expect(loads.every((l) => l === 2)).toBe(true);
  });

  it('respeta el parámetro maxTeamsPerJuror', () => {
    const result = plan(
      teamsOf(1, 4),
      many('j', 4, (id) => juror(id)),
      {
        maxTeamsPerJuror: 2,
        jurorsPerTeam: 3,
      },
    );

    expect(Math.max(...result.jurors.map((j) => j.teamsAfter))).toBe(2);
    expect(result.summary.newAssignments).toBe(8);
    expect(result.summary.incompleteTeams).toBeGreaterThan(0);
  });

  describe('colegios (N0)', () => {
    it('solo asigna seniors: profesores y jurados SENIOR, nunca JUNIOR', () => {
      const result = plan(teamsOf(0, 2), [
        professor('p1'),
        juror('s1', JurorCategory.SENIOR),
        juror('j1'),
        juror('j2'),
      ]);

      const assigned = new Set(result.assignments.map((a) => a.jurorId));
      expect(assigned.has('j1')).toBe(false);
      expect(assigned.has('j2')).toBe(false);
      expect([...assigned].sort()).toEqual(['p1', 's1']);
    });

    it('reporta los cupos de colegio sin seniors', () => {
      const result = plan(teamsOf(0, 1), [professor('p1'), juror('j1')]);

      expect(result.alerts.map((a) => a.code)).toEqual(
        expect.arrayContaining([
          'SCHOOL_WITHOUT_SENIOR_JURORS',
          'TEAM_INCOMPLETE',
        ]),
      );
      expect(result.teams[0].jurors).toHaveLength(1);
    });

    it('prefiere para colegios al profesor que dicta más NRC (allí no hay conflicto)', () => {
      const teams = [team(1, 'N0-COL-01'), ...teamsOf(1, 1, 2)];
      const result = plan(teams, [
        professor('pocos', [1]),
        professor('muchos', [1, 2, 3]),
        ...many('j', 3, (id) => juror(id)),
      ]);

      const school = result.teams.find((t) => t.level === 0)!;
      expect(school.jurors.map((j) => j.id)).toContain('muchos');
    });
  });

  describe('conflicto de interés por NRC', () => {
    it('no asigna a un profesor equipos de sus NRC (universitarios)', () => {
      const teams = [team(1, 'N1-A-01', { memberNrcIds: [7] })];
      const result = plan(teams, [
        professor('p1', [7]),
        ...many('j', 3, (id) => juror(id)),
      ]);

      expect(result.assignments.map((a) => a.jurorId)).not.toContain('p1');
      expect(result.teams[0].jurors).toHaveLength(3);
    });

    it('sí lo asigna en colegios', () => {
      const teams = [team(1, 'N0-COL-01', { memberNrcIds: [7] })];
      const result = plan(teams, [professor('p1', [7])]);

      expect(result.assignments).toEqual([{ teamId: 1, jurorId: 'p1' }]);
    });
  });

  describe('un senior por equipo universitario', () => {
    it('pone un senior en cada equipo cuando alcanza', () => {
      const result = plan(teamsOf(1, 3), [
        professor('p1'),
        ...many('j', 6, (id) => juror(id)),
      ]);

      expect(result.teams.every((t) => t.hasSenior)).toBe(true);
      expect(result.summary.teamsWithoutSenior).toBe(0);
    });

    it('reporta los equipos que quedan sin senior', () => {
      const result = plan(teamsOf(1, 4), [
        professor('p1'),
        ...many('j', 6, (id) => juror(id)),
      ]);

      const without = result.alerts.filter(
        (a) => a.code === 'TEAM_WITHOUT_SENIOR',
      );
      expect(without).toHaveLength(1);
      expect(result.summary.teamsWithoutSenior).toBe(1);
    });
  });

  describe('asignaciones existentes (fijas, P-21)', () => {
    const fixedSenior: PlannerEvaluator = {
      id: 'p1',
      name: 'Prof p1',
      kind: 'PROFESSOR',
      jurorCategory: null,
    };

    it('no quita a nadie y cuenta la carga y el nivel del jurado', () => {
      const teams = [
        team(1, 'N1-A-01', { assigned: [fixedSenior] }),
        team(2, 'N1-A-02', { assigned: [fixedSenior] }),
        ...teamsOf(2, 2, 3),
      ];
      const input = {
        teams,
        jurors: [professor('p1'), ...many('j', 8, (id) => juror(id))],
        limits: LIMITS,
      };
      const result = planAutomaticAssignment(input);

      expectRulesHold(input, result);
      const t1 = result.teams.find((t) => t.id === 1)!;
      expect(t1.jurors.find((j) => j.id === 'p1')!.fixed).toBe(true);
      // p1 ya tenía 2 grupos de N1: como máximo recibe 1 más y solo de N1.
      const p1 = result.jurors.find((j) => j.id === 'p1')!;
      expect(p1.teamsBefore).toBe(2);
      expect(p1.teamsAfter).toBeLessThanOrEqual(3);
      expect(p1.level).toBe(1);
    });

    it('no agrega grupos a un jurado que ya tiene niveles mezclados y lo reporta', () => {
      const teams = [
        team(1, 'N1-A-01', { assigned: [fixedSenior] }),
        team(2, 'N2-A-01', { assigned: [fixedSenior] }),
        ...teamsOf(1, 1, 3),
      ];
      const result = plan(teams, [
        professor('p1'),
        ...many('j', 6, (id) => juror(id)),
      ]);

      expect(result.assignments.map((a) => a.jurorId)).not.toContain('p1');
      expect(result.alerts.map((a) => a.code)).toContain(
        'JUROR_FIXED_MIXED_LEVELS',
      );
    });

    it('volver a ejecutar sobre el resultado no agrega nada', () => {
      const teams = [
        ...teamsOf(0, 1, 1),
        ...teamsOf(1, 3, 2),
        ...teamsOf(3, 2, 6),
      ];
      const jurors = [
        ...many('p', 4, (id) => professor(id)),
        ...many('j', 8, (id) => juror(id)),
      ];
      const first = plan(teams, jurors);

      const evaluators = new Map(jurors.map((j) => [j.id, j]));
      const applied = teams.map((t) => ({
        ...t,
        assigned: first.assignments
          .filter((a) => a.teamId === t.id)
          .map((a) => evaluators.get(a.jurorId)!),
      }));
      const second = plan(applied, jurors);

      expect(first.assignments.length).toBeGreaterThan(0);
      expect(second.assignments).toEqual([]);
    });
  });

  it('ignora equipos sin videojuego confirmado y reporta códigos sin nivel', () => {
    const result = plan(
      [
        team(1, 'N1-A-01', { assignable: false }),
        team(2, 'SIN-NIVEL'),
        team(3, 'N1-A-02'),
      ],
      many('j', 3, (id) => juror(id)),
    );

    expect(result.teams.map((t) => t.id)).toEqual([3]);
    expect(result.alerts.map((a) => a.code)).toContain('UNREADABLE_TEAM_LEVEL');
  });

  it('no usa jurados sin categoría y lo reporta', () => {
    const result = plan(teamsOf(1, 1), [
      juror('sin', null),
      ...many('j', 3, (id) => juror(id)),
    ]);

    expect(result.assignments.map((a) => a.jurorId)).not.toContain('sin');
    expect(result.alerts.map((a) => a.code)).toContain(
      'JUROR_MISSING_CATEGORY',
    );
  });

  it('reporta grupos incompletos cuando faltan jurados', () => {
    const result = plan(
      teamsOf(1, 3),
      many('j', 2, (id) => juror(id)),
    );

    expect(result.summary.incompleteTeams).toBeGreaterThan(0);
    expect(result.levels[0].missingSlots).toBe(9 - 6);
    expect(
      result.alerts.filter((a) => a.code === 'TEAM_INCOMPLETE').length,
    ).toBe(result.summary.incompleteTeams);
  });

  it('mueve a otro nivel a un jurado que quedó sin grupos por conflicto de NRC', () => {
    // p1 va primero a N1 (senior para su único equipo), pero dicta su NRC.
    const teams = [
      team(1, 'N1-A-01', { memberNrcIds: [7] }),
      team(2, 'N2-A-01'),
    ];
    const result = plan(teams, [
      professor('p1', [7]),
      ...many('j', 4, (id) => juror(id)),
    ]);

    expect(result.assignments).toContainEqual({ teamId: 2, jurorId: 'p1' });
    expect(result.jurors.find((j) => j.id === 'p1')!.level).toBe(2);
    expect(result.teams.find((t) => t.id === 2)!.hasSenior).toBe(true);
  });

  it('es determinista: el orden de entrada no cambia el plan', () => {
    const teams = [
      ...teamsOf(0, 1, 1),
      ...teamsOf(1, 3, 2),
      ...teamsOf(2, 3, 5),
    ];
    const jurors = [
      ...many('p', 3, (id) => professor(id, [Number(id.slice(1))])),
      juror('s1', JurorCategory.SENIOR),
      ...many('j', 9, (id) => juror(id)),
    ];

    const a = plan(teams, jurors);
    const b = plan([...teams].reverse(), [...jurors].reverse());
    expect(b.assignments).toEqual(a.assignments);
  });

  it('con datos tipo feria (colegios + 4 niveles) cumple todas las reglas', () => {
    const teams = [
      ...teamsOf(0, 3, 1),
      ...teamsOf(1, 10, 10),
      ...teamsOf(2, 8, 30),
      ...teamsOf(3, 6, 50),
      ...teamsOf(4, 4, 70),
    ].map((t, i) => ({ ...t, memberNrcIds: [100 + (i % 6)] }));
    const jurors = [
      ...many('p', 8, (id) => professor(id, [100 + (Number(id.slice(1)) % 6)])),
      ...many('j', 30, (id) => juror(id)),
    ];
    const input = { teams, jurors, limits: LIMITS };
    const result = planAutomaticAssignment(input);

    expectRulesHold(input, result);
    const school = result.teams.filter((t) => t.level === 0);
    for (const t of school) {
      expect(t.jurors.every((j) => j.kind === 'PROFESSOR')).toBe(true);
    }
    for (const a of result.assignments) {
      const t = teams.find((x) => x.id === a.teamId)!;
      const j = jurors.find((x) => x.id === a.jurorId)!;
      if (extractTeamLevel(t.teamCode) !== 0) {
        expect(j.managedNrcIds.some((n) => t.memberNrcIds.includes(n))).toBe(
          false,
        );
      }
    }
    expect(result.summary.completeTeams).toBe(teams.length);
  });
});
