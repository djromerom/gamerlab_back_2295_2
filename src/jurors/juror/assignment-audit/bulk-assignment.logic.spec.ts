import {
  AssignmentBlocker,
  AssignmentWarning,
} from '../assignment-validation/assignment-rules.types';
import {
  blockerCodeOf,
  isJurorLevelBlocker,
  blocksByTeam,
  statusOf,
  summaryMessage,
  warningsForTeam,
} from './bulk-assignment.logic';

const blocker = (
  code: AssignmentBlocker['code'],
  teamId?: number,
): AssignmentBlocker => ({ code, message: `msg ${code} ${teamId}`, teamId });

const warning = (
  code: AssignmentWarning['code'],
  teamId?: number,
): AssignmentWarning => ({ code, message: `msg ${code}`, teamId });

describe('HU-42: bulk-assignment.logic', () => {
  describe('blockerCodeOf', () => {
    it('el equipo de otra edición usa el código de solo lectura de HU-27', () => {
      expect(blockerCodeOf(blocker('TEAM_NOT_IN_ACTIVE_EDITION'), 'RO')).toBe(
        'RO',
      );
    });

    it('los demás bloqueos conservan su código', () => {
      expect(blockerCodeOf(blocker('SCHOOL_REQUIRES_SENIOR'), 'RO')).toBe(
        'SCHOOL_REQUIRES_SENIOR',
      );
    });
  });

  it('isJurorLevelBlocker: los del jurado frenan todo; los del equipo, no', () => {
    expect(isJurorLevelBlocker(blocker('EVALUATOR_NOT_IN_EDITION', 1))).toBe(
      true,
    );
    expect(isJurorLevelBlocker(blocker('MISSING_JUROR_CATEGORY', 1))).toBe(
      true,
    );
    expect(isJurorLevelBlocker(blocker('INVALID_EVALUATOR_ROLE', 1))).toBe(
      true,
    );
    expect(isJurorLevelBlocker(blocker('SCHOOL_REQUIRES_SENIOR', 1))).toBe(
      false,
    );
    expect(isJurorLevelBlocker(blocker('DUPLICATE_ASSIGNMENT', 1))).toBe(false);
    expect(isJurorLevelBlocker(blocker('TEAM_NOT_CONFIRMED', 1))).toBe(false);
  });

  describe('blocksByTeam', () => {
    it('agrupa por equipo y se queda con el primer bloqueo de cada uno', () => {
      const result = blocksByTeam(
        [
          blocker('SCHOOL_REQUIRES_SENIOR', 1),
          blocker('DUPLICATE_ASSIGNMENT', 1),
          blocker('DUPLICATE_ASSIGNMENT', 2),
        ],
        [1, 2, 3],
        'RO',
      );
      expect([...result.keys()]).toEqual([1, 2]);
      expect(result.get(1)?.code).toBe('SCHOOL_REQUIRES_SENIOR');
      expect(result.get(2)?.code).toBe('DUPLICATE_ASSIGNMENT');
    });

    it('un bloqueo sin equipo vale para todos', () => {
      const result = blocksByTeam(
        [blocker('MISSING_JUROR_CATEGORY')],
        [1, 2],
        'RO',
      );
      expect([...result.keys()]).toEqual([1, 2]);
    });

    it('ignora un bloqueo de un equipo que no está en la lista', () => {
      expect(
        blocksByTeam([blocker('DUPLICATE_ASSIGNMENT', 9)], [1], 'RO').size,
      ).toBe(0);
    });
  });

  describe('warningsForTeam', () => {
    const all = [
      warning('JUROR_OVER_LIMIT'),
      warning('NRC_CONFLICT', 1),
      warning('TEAM_UNDER_MIN', 2),
    ];

    it('devuelve las del equipo y las del jurado en general', () => {
      expect(warningsForTeam(all, 1).map((w) => w.code)).toEqual([
        'JUROR_OVER_LIMIT',
        'NRC_CONFLICT',
      ]);
      expect(warningsForTeam(all, 3).map((w) => w.code)).toEqual([
        'JUROR_OVER_LIMIT',
      ]);
    });
  });

  it('statusOf: con advertencias aceptadas es ASSIGNED_WITH_WARNINGS', () => {
    expect(statusOf([])).toBe('ASSIGNED');
    expect(statusOf([warning('NRC_CONFLICT', 1)])).toBe(
      'ASSIGNED_WITH_WARNINGS',
    );
  });

  describe('summaryMessage', () => {
    it.each([
      [3, 0, 'Se asignaron 3 equipos al jurado.'],
      [1, 0, 'Se asignó 1 equipo al jurado.'],
      [
        2,
        1,
        'Se asignaron 2 equipos al jurado. 1 equipo no se asignó por un bloqueo.',
      ],
      [
        1,
        2,
        'Se asignó 1 equipo al jurado. 2 equipos no se asignaron por un bloqueo.',
      ],
      [0, 1, 'No se asignó ningún equipo: 1 equipo tiene un bloqueo.'],
      [0, 3, 'No se asignó ningún equipo: 3 equipos tienen un bloqueo.'],
    ])('%i asignados y %i bloqueados', (assigned, blocked, expected) => {
      expect(summaryMessage(assigned, blocked)).toBe(expected);
    });
  });
});
