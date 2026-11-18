import { JurorAssignmentAuditLog } from '@prisma/client';
import { ASSIGNMENT_WARNING_TEXTS } from '../assignment-validation/assignment-warning-texts';
import { translateAuditNote, withAuditNames } from './audit-log-view';

/** ARK-262 (BG-62): nombres y notas legibles en el historial de cambios manuales. */
describe('historial de cambios manuales: vista (ARK-262)', () => {
  describe('translateAuditNote', () => {
    it('traduce el código de una advertencia aceptada', () => {
      expect(
        translateAuditNote(
          'Desasignación manual desde módulo admin. Advertencias aceptadas: TEAM_UNDER_MIN.',
        ),
      ).toBe(
        'Desasignación manual desde módulo admin. Advertencias aceptadas: El grupo quedaría con menos de 3 jurados.',
      );
    });

    it('traduce varios códigos separándolos con punto y coma', () => {
      expect(
        translateAuditNote(
          'Asignación manual desde módulo admin. Advertencias aceptadas: JUROR_OVER_LIMIT, JUROR_MIXED_LEVELS.',
        ),
      ).toBe(
        'Asignación manual desde módulo admin. Advertencias aceptadas: El jurado quedaría con más grupos del máximo recomendado; El jurado quedaría con grupos de distintos niveles.',
      );
    });

    it('un código desconocido se deja como está', () => {
      expect(
        translateAuditNote('X. Advertencias aceptadas: NUEVO_CODIGO.'),
      ).toBe('X. Advertencias aceptadas: NUEVO_CODIGO.');
    });

    it('una nota sin advertencias, o sin nota, no cambia', () => {
      expect(translateAuditNote('Asignación automática (HU-07).')).toBe(
        'Asignación automática (HU-07).',
      );
      expect(translateAuditNote(null)).toBeNull();
    });

    it('todo código de advertencia conocido tiene su texto', () => {
      for (const [code, text] of Object.entries(ASSIGNMENT_WARNING_TEXTS)) {
        expect(text.length).toBeGreaterThan(10);
        expect(
          translateAuditNote(`N. Advertencias aceptadas: ${code}.`),
        ).toContain(text);
      }
    });
  });

  describe('withAuditNames', () => {
    const log = (
      over: Partial<JurorAssignmentAuditLog> = {},
    ): JurorAssignmentAuditLog => ({
      id: 1,
      action: 'ASSIGN',
      actorUserId: 'admin-1',
      teamId: 10,
      jurorId: 'juror-1',
      previousJurorId: null,
      newJurorId: 'juror-1',
      notes: 'Asignación manual desde módulo admin.',
      createdAt: new Date('2026-11-18T10:00:00Z'),
      ...over,
    });

    const setup = () => ({
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'admin-1', firstName: 'Admin', lastName: 'Romero' },
          { id: 'juror-1', firstName: 'Ana', lastName: 'Gómez' },
          { id: 'juror-2', firstName: 'Luis', lastName: ' ' },
        ]),
      },
      team: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            teamName: 'Los Pixeles',
            teamCode: 'N1-ABC-101',
            videogame: { name: 'Juego Uno' },
          },
          {
            id: 11,
            teamName: 'Sin juego',
            teamCode: 'N1-ABC-102',
            videogame: null,
          },
        ]),
      },
    });

    it('agrega los nombres con una sola consulta de usuarios y una de equipos', async () => {
      const prisma = setup();
      const [first, second] = await withAuditNames(prisma as never, [
        log(),
        log({
          id: 2,
          action: 'REASSIGN',
          teamId: 11,
          previousJurorId: 'juror-1',
          newJurorId: 'juror-2',
          jurorId: null,
          notes:
            'Asignación manual desde módulo admin. Advertencias aceptadas: NRC_CONFLICT.',
        }),
      ]);

      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
      expect(first).toMatchObject({
        id: 1,
        actorUserId: 'admin-1',
        actorName: 'Admin Romero',
        jurorName: 'Ana Gómez',
        newJurorName: 'Ana Gómez',
        previousJurorName: null,
        teamName: 'Los Pixeles',
        teamCode: 'N1-ABC-101',
        gameName: 'Juego Uno',
        notesText: 'Asignación manual desde módulo admin.',
      });
      expect(second).toMatchObject({
        previousJurorName: 'Ana Gómez',
        newJurorName: 'Luis',
        jurorName: null,
        gameName: null,
      });
      expect(second.notesText).toContain('El jurado dicta un NRC');
    });

    it('un usuario o equipo que ya no existe da null, nunca el id', async () => {
      const prisma = setup();
      const [view] = await withAuditNames(prisma as never, [
        log({ actorUserId: 'borrado', teamId: 99, jurorId: 'borrado' }),
      ]);
      expect(view.actorName).toBeNull();
      expect(view.jurorName).toBeNull();
      expect(view.teamName).toBeNull();
      expect(view.teamCode).toBeNull();
    });

    it('sin registros no consulta nada', async () => {
      const prisma = setup();
      expect(await withAuditNames(prisma as never, [])).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.team.findMany).not.toHaveBeenCalled();
    });

    it('conserva todos los campos guardados', async () => {
      const prisma = setup();
      const [view] = await withAuditNames(prisma as never, [log()]);
      expect(view).toMatchObject(log());
    });
  });
});
