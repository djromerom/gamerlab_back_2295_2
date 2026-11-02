import { ForbiddenException } from '@nestjs/common';
import { ROLE_IDS } from '../auth/constants/roles';
import {
  filterTeamForAudience,
  isTeamLeaderOrMember,
  resolveTeamAudience,
} from './team-visibility';

describe('team-visibility (ARK-112)', () => {
  describe('isTeamLeaderOrMember', () => {
    const team = { userId: 'leader-1' };

    it('reconoce al líder por su id', () => {
      expect(
        isTeamLeaderOrMember({ id: 'leader-1', email: 'x@u.co' }, team, []),
      ).toBe(true);
    });

    it('reconoce a un integrante por correo, sin mayúsculas ni espacios', () => {
      expect(
        isTeamLeaderOrMember({ id: 'm', email: ' Ana@U.co ' }, team, [
          'ana@u.co',
        ]),
      ).toBe(true);
    });

    it('no acepta a alguien sin correo ni a otro estudiante', () => {
      expect(
        isTeamLeaderOrMember({ id: 'm', email: '' }, team, ['', null]),
      ).toBe(false);
      expect(
        isTeamLeaderOrMember({ id: 'm', email: 'b@u.co' }, team, ['ana@u.co']),
      ).toBe(false);
    });
  });

  describe('resolveTeamAudience', () => {
    it('el administrador siempre es admin', () => {
      expect(resolveTeamAudience({ roleId: ROLE_IDS.ADMIN }, false)).toBe(
        'admin',
      );
    });

    it('quien pertenece al equipo es own', () => {
      expect(resolveTeamAudience({ roleId: ROLE_IDS.STUDENT }, true)).toBe(
        'own',
      );
    });

    it('un estudiante ajeno recibe 403', () => {
      expect(() =>
        resolveTeamAudience({ roleId: ROLE_IDS.STUDENT }, false),
      ).toThrow(ForbiddenException);
    });

    it('profesor, jurado y staff ajenos son other', () => {
      for (const roleId of [ROLE_IDS.PROFESSOR, ROLE_IDS.JUROR, 5]) {
        expect(resolveTeamAudience({ roleId }, false)).toBe('other');
      }
    });
  });

  describe('filterTeamForAudience', () => {
    const team = {
      id: 1,
      verificationCode: 'ZZ99',
      user: { id: 'l', email: 'l@u.co' },
      members: [{ id: 1, email: 'm@u.co', studentCode: '7' }],
      assignedJurors: [{ id: 'j', email: 'j@u.co' }],
      registrationDate: new Date('2026-10-01T00:00:00Z'),
    };

    it('admin: el mismo objeto', () => {
      expect(filterTeamForAudience(team, 'admin')).toBe(team);
    });

    it('own: solo quita el correo de los jurados', () => {
      const out = filterTeamForAudience(team, 'own');
      expect(out.assignedJurors).toEqual([{ id: 'j' }]);
      expect(out.members).toBe(team.members);
      expect(out.verificationCode).toBe('ZZ99');
    });

    it('own sin jurados (GET /teams/:id): sin cambios', () => {
      const row = { id: 1, verificationCode: 'ZZ99' };
      expect(filterTeamForAudience(row, 'own')).toBe(row);
    });

    it('other: sin correos, códigos estudiantiles ni código de verificación', () => {
      const out = filterTeamForAudience(team, 'other') as Record<
        string,
        unknown
      >;
      expect(out).not.toHaveProperty('verificationCode');
      expect(out).toEqual({
        id: 1,
        user: { id: 'l' },
        members: [{ id: 1 }],
        assignedJurors: [{ id: 'j' }],
        registrationDate: team.registrationDate,
      });
    });
  });
});
