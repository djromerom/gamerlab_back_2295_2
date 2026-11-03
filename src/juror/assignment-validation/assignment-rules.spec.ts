import { JurorCategory } from '@prisma/client';

import {
  evaluateAssignmentChanges,
  extractTeamLevel,
  findBlockers,
  findWarnings,
  hasNrcConflict,
  isSeniorEvaluator,
} from './assignment-rules';
import {
  AssignmentChange,
  AssignmentRulesInput,
  AssignmentWarningContext,
  RuleEvaluator,
  RuleTeam,
} from './assignment-rules.types';

// ─── Datos de prueba ─────────────────────────────────────────────────────────

const professor: RuleEvaluator = {
  id: 'prof',
  name: 'Ana Pérez',
  kind: 'PROFESSOR',
  jurorCategory: null,
};
const senior: RuleEvaluator = {
  id: 'senior',
  name: 'Luis Gómez',
  kind: 'JUROR',
  jurorCategory: JurorCategory.SENIOR,
};
const junior: RuleEvaluator = {
  id: 'junior',
  name: 'Sara Ruiz',
  kind: 'JUROR',
  jurorCategory: JurorCategory.JUNIOR,
};
const noCategory: RuleEvaluator = {
  id: 'nocat',
  name: 'Sin Cat',
  kind: 'JUROR',
  jurorCategory: null,
};
const student: RuleEvaluator = {
  id: 'student',
  name: 'Estudiante',
  kind: 'OTHER',
  jurorCategory: null,
};

const team = (
  id: number,
  teamCode: string,
  jurorIds: string[] = [],
  editionId = 1,
): RuleTeam => ({ id, teamCode, editionId, jurorIds });

const add = (jurorId: string, teamId: number): AssignmentChange => ({
  type: 'ADD',
  jurorId,
  teamId,
});
const remove = (jurorId: string, teamId: number): AssignmentChange => ({
  type: 'REMOVE',
  jurorId,
  teamId,
});

const emptyContext = (): AssignmentWarningContext => ({
  teamsByJuror: new Map(),
  managedNrcsByJuror: new Map(),
  nrcsByTeam: new Map(),
});

const input = (
  teams: RuleTeam[],
  evaluators: RuleEvaluator[],
  changes: AssignmentChange[],
): AssignmentRulesInput => ({ teams, evaluators, changes });

const codes = (items: Array<{ code: string }>) => items.map((i) => i.code);

// Un grupo ya lleno (3 jurados) para que TEAM_UNDER_MIN no interfiera.
const FULL = ['x1', 'x2', 'x3'];

describe('assignment-rules (HU-08)', () => {
  describe('extractTeamLevel', () => {
    it.each([
      ['N0-COLEGIOS-01', 0],
      ['n1-ayp-06', 1],
      ['N4-DATOS2-20', 4],
      ['AYP-06', null],
      ['', null],
      [null, null],
    ])('%s → %s', (code, level) => {
      expect(extractTeamLevel(code)).toBe(level);
    });
  });

  // ─── Bloqueos ──────────────────────────────────────────────────────────────

  describe('bloqueos', () => {
    it('INVALID_EVALUATOR_ROLE: usuario que no es jurado ni profesor', () => {
      const result = findBlockers(
        input([team(1, 'N1-A')], [student], [add('student', 1)]),
      );
      expect(codes(result)).toEqual(['INVALID_EVALUATOR_ROLE']);
    });

    it('UNREADABLE_TEAM_LEVEL: el código del equipo no trae nivel', () => {
      const result = findBlockers(
        input([team(1, 'SIN-NIVEL')], [senior], [add('senior', 1)]),
      );
      expect(codes(result)).toEqual(['UNREADABLE_TEAM_LEVEL']);
    });

    it('MISSING_JUROR_CATEGORY: jurado sin categoría, en cualquier nivel', () => {
      const result = findBlockers(
        input([team(1, 'N2-A')], [noCategory], [add('nocat', 1)]),
      );
      expect(codes(result)).toEqual(['MISSING_JUROR_CATEGORY']);
    });

    it('SCHOOL_REQUIRES_SENIOR: un junior no puede ir a colegios (P-08)', () => {
      const result = findBlockers(
        input([team(1, 'N0-COL-01')], [junior], [add('junior', 1)]),
      );
      expect(codes(result)).toEqual(['SCHOOL_REQUIRES_SENIOR']);
      expect(result[0].message).toContain(
        'Los jurados JUNIOR no pueden ser asignados a colegios',
      );
    });

    it('colegios aceptan profesores (sin categoría) y jurados senior', () => {
      const result = findBlockers(
        input(
          [team(1, 'N0-COL-01')],
          [professor, senior],
          [add('prof', 1), add('senior', 1)],
        ),
      );
      expect(result).toEqual([]);
    });

    it('un junior sí puede ir a un nivel universitario', () => {
      const result = findBlockers(
        input([team(1, 'N1-A')], [junior], [add('junior', 1)]),
      );
      expect(result).toEqual([]);
    });

    it('DUPLICATE_ASSIGNMENT: el jurado ya está en el grupo', () => {
      const result = findBlockers(
        input([team(1, 'N1-A', ['senior'])], [senior], [add('senior', 1)]),
      );
      expect(codes(result)).toEqual(['DUPLICATE_ASSIGNMENT']);
    });

    it('DUPLICATE_ASSIGNMENT también dentro de la misma operación', () => {
      const result = findBlockers(
        input(
          [team(1, 'N1-A')],
          [senior],
          [add('senior', 1), add('senior', 1)],
        ),
      );
      expect(codes(result)).toEqual(['DUPLICATE_ASSIGNMENT']);
    });

    it('reasignar (REMOVE + ADD) no cuenta como duplicado', () => {
      const result = findBlockers(
        input(
          [team(1, 'N1-A', ['junior'])],
          [senior],
          [remove('junior', 1), add('senior', 1)],
        ),
      );
      expect(result).toEqual([]);
    });

    it('con bloqueos no calcula advertencias (no se podrá guardar)', () => {
      const result = evaluateAssignmentChanges(
        input([team(1, 'N0-COL-01')], [junior], [add('junior', 1)]),
        emptyContext(),
      );
      expect(codes(result.blockers)).toEqual(['SCHOOL_REQUIRES_SENIOR']);
      expect(result.warnings).toEqual([]);
    });
  });

  // ─── Advertencias ──────────────────────────────────────────────────────────

  describe('JUROR_OVER_LIMIT (más de 3 grupos por jurado)', () => {
    const contextWith = (teams: Array<[number, string, number?]>) => {
      const context = emptyContext();
      context.teamsByJuror.set(
        'senior',
        teams.map(([id, teamCode, editionId = 1]) => ({
          id,
          teamCode,
          editionId,
        })),
      );
      return context;
    };

    it('advierte al pasar a 4 grupos y dice la regla', () => {
      const warnings = findWarnings(
        input([team(4, 'N1-D', FULL)], [senior], [add('senior', 4)]),
        contextWith([
          [1, 'N1-A'],
          [2, 'N1-B'],
          [3, 'N1-C'],
        ]),
      );
      expect(codes(warnings)).toEqual(['JUROR_OVER_LIMIT']);
      expect(warnings[0].message).toBe(
        'El jurado senior Luis Gómez quedaría con 4 grupos; el máximo recomendado es 3 por jurado.',
      );
      expect(warnings[0].details).toMatchObject({ teams: 4, maximum: 3 });
    });

    it('con exactamente 3 grupos no advierte', () => {
      const warnings = findWarnings(
        input([team(3, 'N1-C', FULL)], [senior], [add('senior', 3)]),
        contextWith([
          [1, 'N1-A'],
          [2, 'N1-B'],
        ]),
      );
      expect(warnings).toEqual([]);
    });

    it('solo cuenta los grupos de la misma edición', () => {
      const warnings = findWarnings(
        input([team(9, 'N1-Z', FULL, 2)], [senior], [add('senior', 9)]),
        contextWith([
          [1, 'N1-A', 1],
          [2, 'N1-B', 1],
          [3, 'N1-C', 1],
        ]),
      );
      expect(warnings).toEqual([]);
    });

    it('respeta un límite configurado', () => {
      const warnings = findWarnings(
        {
          ...input([team(2, 'N1-B', FULL)], [senior], [add('senior', 2)]),
          limits: { maxTeamsPerJuror: 1 },
        },
        contextWith([[1, 'N1-A']]),
      );
      expect(codes(warnings)).toEqual(['JUROR_OVER_LIMIT']);
    });
  });

  describe('JUROR_MIXED_LEVELS (grupos de distintos niveles)', () => {
    it('advierte y lista los niveles', () => {
      const context = emptyContext();
      context.teamsByJuror.set('senior', [
        { id: 1, teamCode: 'N1-A', editionId: 1 },
      ]);
      const warnings = findWarnings(
        input([team(2, 'N2-B', FULL)], [senior], [add('senior', 2)]),
        context,
      );
      expect(codes(warnings)).toEqual(['JUROR_MIXED_LEVELS']);
      expect(warnings[0].message).toContain('distintos niveles (N1, N2)');
      expect(warnings[0].details).toMatchObject({ levels: [1, 2] });
    });

    it('mismo nivel no advierte', () => {
      const context = emptyContext();
      context.teamsByJuror.set('senior', [
        { id: 1, teamCode: 'N1-A', editionId: 1 },
      ]);
      expect(
        findWarnings(
          input([team(2, 'N1-B', FULL)], [senior], [add('senior', 2)]),
          context,
        ),
      ).toEqual([]);
    });
  });

  describe('TEAM_UNDER_MIN (grupo con menos de 3 jurados)', () => {
    it('advierte al quitar un jurado de un grupo de 3', () => {
      const warnings = findWarnings(
        input([team(1, 'N1-A', FULL)], [], [remove('x1', 1)]),
        emptyContext(),
      );
      expect(codes(warnings)).toEqual(['TEAM_UNDER_MIN']);
      expect(warnings[0].message).toBe(
        'El grupo N1-A quedaría con 2 jurado(s); cada grupo necesita mínimo 3 evaluaciones.',
      );
    });

    it('al quitar de un grupo de 4 (queda con 3) no advierte', () => {
      expect(
        findWarnings(
          input([team(1, 'N1-A', [...FULL, 'x4'])], [], [remove('x4', 1)]),
          emptyContext(),
        ),
      ).toEqual([]);
    });

    it('al ir llenando un grupo vacío no advierte en cada paso', () => {
      expect(
        findWarnings(
          input([team(1, 'N1-A')], [senior], [add('senior', 1)]),
          emptyContext(),
        ),
      ).toEqual([]);
    });

    it('reasignar mantiene la cantidad y no advierte', () => {
      expect(
        findWarnings(
          input(
            [team(1, 'N1-A', ['junior'])],
            [senior],
            [remove('junior', 1), add('senior', 1)],
          ),
          emptyContext(),
        ),
      ).toEqual([]);
    });

    it('más de 3 jurados en un grupo es válido (suplentes)', () => {
      expect(
        findWarnings(
          input([team(1, 'N1-A', FULL)], [senior], [add('senior', 1)]),
          emptyContext(),
        ),
      ).toEqual([]);
    });
  });

  describe('NRC_CONFLICT (equipos de sus propios NRC)', () => {
    const nrcContext = () => {
      const context = emptyContext();
      context.managedNrcsByJuror.set('prof', [
        { id: 10, code: 2101 },
        { id: 11, code: 2102 },
      ]);
      context.nrcsByTeam.set(1, [
        { id: 10, code: 2101 },
        { id: 10, code: 2101 },
      ]);
      context.nrcsByTeam.set(2, [{ id: 99, code: 9999 }]);
      context.nrcsByTeam.set(3, [{ id: 10, code: 2101 }]);
      return context;
    };

    it('advierte con el NRC en común (sin repetir)', () => {
      const warnings = findWarnings(
        input([team(1, 'N1-A', FULL)], [professor], [add('prof', 1)]),
        nrcContext(),
      );
      expect(codes(warnings)).toEqual(['NRC_CONFLICT']);
      expect(warnings[0].message).toBe(
        'El profesor Ana Pérez dicta el NRC 2101 de integrantes del grupo N1-A (conflicto de interés).',
      );
    });

    it('sin NRC en común no advierte', () => {
      expect(
        findWarnings(
          input([team(2, 'N1-B', FULL)], [professor], [add('prof', 2)]),
          nrcContext(),
        ),
      ).toEqual([]);
    });

    it('en colegios (N0) no aplica, igual que la automática', () => {
      expect(
        findWarnings(
          input([team(3, 'N0-COL-01', FULL)], [professor], [add('prof', 3)]),
          nrcContext(),
        ),
      ).toEqual([]);
    });
  });

  describe('varias reglas a la vez', () => {
    it('devuelve todas las advertencias que apliquen', () => {
      const context = emptyContext();
      context.teamsByJuror.set('prof', [
        { id: 1, teamCode: 'N1-A', editionId: 1 },
        { id: 2, teamCode: 'N1-B', editionId: 1 },
        { id: 3, teamCode: 'N1-C', editionId: 1 },
      ]);
      context.managedNrcsByJuror.set('prof', [{ id: 10, code: 2101 }]);
      context.nrcsByTeam.set(4, [{ id: 10, code: 2101 }]);

      const result = evaluateAssignmentChanges(
        input([team(4, 'N2-D', FULL)], [professor], [add('prof', 4)]),
        context,
      );
      expect(result.blockers).toEqual([]);
      expect(codes(result.warnings).sort()).toEqual(
        ['JUROR_MIXED_LEVELS', 'JUROR_OVER_LIMIT', 'NRC_CONFLICT'].sort(),
      );
    });
  });

  describe('VALIDATION_UNAVAILABLE (no se pudo validar)', () => {
    it('sin contexto avisa, pero conserva lo que sí se puede calcular', () => {
      const result = evaluateAssignmentChanges(
        input([team(1, 'N1-A', FULL)], [], [remove('x1', 1)]),
        null,
      );
      expect(codes(result.warnings)).toEqual([
        'TEAM_UNDER_MIN',
        'VALIDATION_UNAVAILABLE',
      ]);
    });

    it('sin contexto los bloqueos se siguen aplicando', () => {
      const result = evaluateAssignmentChanges(
        input([team(1, 'N0-COL')], [junior], [add('junior', 1)]),
        null,
      );
      expect(codes(result.blockers)).toEqual(['SCHOOL_REQUIRES_SENIOR']);
    });
  });
  describe('ARK-131 (BG-18): edición activa', () => {
    const feria5 = { id: 5, title: 'Feria 5' };
    const team4: RuleTeam = {
      ...team(1, 'N1-AYP-01', ['x1'], 4),
      editionTitle: 'Feria 4',
    };
    const team5 = team(2, 'N1-AYP-02', [], 5);
    const withEdition = (
      teams: RuleTeam[],
      evaluators: RuleEvaluator[],
      changes: AssignmentChange[],
    ): AssignmentRulesInput => ({
      ...input(teams, evaluators, changes),
      activeEdition: feria5,
    });

    it('agregar a un equipo de la edición 4 con la 5 activa es un bloqueo', () => {
      const blockers = findBlockers(
        withEdition([team4], [senior], [add('senior', 1)]),
      );
      expect(blockers).toEqual([
        expect.objectContaining({
          code: 'TEAM_NOT_IN_ACTIVE_EDITION',
          teamId: 1,
          message: expect.stringMatching(
            /N1-AYP-01: pertenece a «Feria 4».*solo lectura/,
          ),
        }),
      ]);
    });

    it('quitar y reasignar en la edición 4 también se bloquean (un bloqueo por equipo)', () => {
      expect(
        codes(findBlockers(withEdition([team4], [], [remove('x1', 1)]))),
      ).toEqual(['TEAM_NOT_IN_ACTIVE_EDITION']);
      expect(
        codes(
          findBlockers(
            withEdition([team4], [senior], [remove('x1', 1), add('senior', 1)]),
          ),
        ),
      ).toEqual(['TEAM_NOT_IN_ACTIVE_EDITION']);
    });

    it('un equipo de la edición 5 (activa) no se bloquea', () => {
      expect(
        findBlockers(withEdition([team5], [senior], [add('senior', 2)])),
      ).toEqual([]);
    });

    it('sin activeEdition no se revisa la edición (compatibilidad)', () => {
      expect(findBlockers(input([team4], [senior], [add('senior', 1)]))).toEqual(
        [],
      );
    });

    it('un evaluador que no participa en la edición activa no se puede agregar', () => {
      const notJuror = { ...senior, participatesInActiveEdition: false };
      const notProfessor = { ...professor, participatesInActiveEdition: false };

      const [jurorBlocker] = findBlockers(
        withEdition([team5], [notJuror], [add('senior', 2)]),
      );
      expect(jurorBlocker).toMatchObject({
        code: 'EVALUATOR_NOT_IN_EDITION',
        jurorId: 'senior',
        teamId: 2,
      });
      expect(jurorBlocker.message).toMatch(
        /no participa en «Feria 5».*confirmado en Jurados de la edición/,
      );

      const [professorBlocker] = findBlockers(
        withEdition([team5], [notProfessor], [add('prof', 2)]),
      );
      expect(professorBlocker.message).toMatch(/NRC activo en la edición/);
    });

    it('participar (true) o no comprobado (undefined) no bloquea', () => {
      const participates = { ...senior, participatesInActiveEdition: true };
      expect(
        findBlockers(withEdition([team5], [participates], [add('senior', 2)])),
      ).toEqual([]);
      expect(
        findBlockers(withEdition([team5], [senior], [add('senior', 2)])),
      ).toEqual([]);
    });

    it('quitar a quien ya no participa no se bloquea', () => {
      const notJuror = { ...senior, participatesInActiveEdition: false };
      expect(
        findBlockers(
          withEdition([team(2, 'N1-AYP-02', ['senior'], 5)], [notJuror], [
            remove('senior', 2),
          ]),
        ),
      ).toEqual([]);
    });

    it('evaluateAssignmentChanges no calcula advertencias si el equipo es de otra edición', () => {
      const result = evaluateAssignmentChanges(
        withEdition([team4], [], [remove('x1', 1)]),
        emptyContext(),
      );
      expect(codes(result.blockers)).toEqual(['TEAM_NOT_IN_ACTIVE_EDITION']);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('ayudantes compartidos con HU-07', () => {
    it('isSeniorEvaluator: profesor o jurado SENIOR', () => {
      expect(
        isSeniorEvaluator({ kind: 'PROFESSOR', jurorCategory: null }),
      ).toBe(true);
      expect(
        isSeniorEvaluator({
          kind: 'JUROR',
          jurorCategory: JurorCategory.SENIOR,
        }),
      ).toBe(true);
      expect(
        isSeniorEvaluator({
          kind: 'JUROR',
          jurorCategory: JurorCategory.JUNIOR,
        }),
      ).toBe(false);
      expect(isSeniorEvaluator({ kind: 'JUROR', jurorCategory: null })).toBe(
        false,
      );
      expect(
        isSeniorEvaluator({
          kind: 'OTHER',
          jurorCategory: JurorCategory.SENIOR,
        }),
      ).toBe(false);
    });

    it('hasNrcConflict: NRC compartido, salvo colegios', () => {
      const teamNrcs = new Set([7, 8]);
      expect(hasNrcConflict(1, [7], teamNrcs)).toBe(true);
      expect(hasNrcConflict(1, [9], teamNrcs)).toBe(false);
      expect(hasNrcConflict(0, [7], teamNrcs)).toBe(false);
      expect(hasNrcConflict(2, [], teamNrcs)).toBe(false);
    });
  });
});
