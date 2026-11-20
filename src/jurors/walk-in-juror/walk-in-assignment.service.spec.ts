import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentValidationService } from 'src/jurors/juror/assignment-validation/assignment-validation.service';
import { WalkInAssignmentService } from './walk-in-assignment.service';

const ADMIN_ID = 'admin-1';
const JUROR_ID = 'sub-1';
const edition = { id: 5, title: 'ARKAD 2026-30' };
const candidate = { id: JUROR_ID, firstName: 'Laura', lastName: 'Gómez' };
/** 26-nov-2026 en Bogotá (UTC-5): 10:30 = antes del control; 11:30 = después. */
const BEFORE_CONTROL = new Date('2026-11-26T15:30:00.000Z');
const AFTER_CONTROL = new Date('2026-11-26T16:30:00.000Z');
const schedule = {
  fairDate: '2026-11-26',
  startTime: '08:00',
  alertTime: '10:00',
  controlTime: '11:00',
  closeTime: '12:00',
};

/** Equipo de `team.findMany` en la propuesta. */
const suggestionTeam = (id: number, teamCode: string, jurorIds: string[]) => ({
  id,
  teamCode,
  teamName: `Equipo ${teamCode}`,
  videogame: { id: id * 10, name: `Juego ${id}` },
  assignedJurors: jurorIds.map((jid) => ({ id: jid })),
});

/** Equipo de `team.findMany` en la asignación. */
const assignTeam = (
  id: number,
  teamCode: string,
  jurorIds: string[] = ['j-a', 'j-b'],
  extra: Record<string, unknown> = {},
) => ({
  id,
  teamCode,
  teamName: `Equipo ${teamCode}`,
  editionId: edition.id,
  notGradable: false,
  edition: { title: edition.title },
  videogame: { videogameStatus: { status: 'CONFIRMADO' } },
  assignedJurors: jurorIds.map((jid) => ({ id: jid })),
  ...extra,
});

describe('WalkInAssignmentService (HU-24)', () => {
  const tx = { team: { update: jest.fn() } };
  const prisma = {
    edition: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    team: { findMany: jest.fn() },
    jurorAttendance: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const schedules = { findForEdition: jest.fn() };
  const validation = { validate: jest.fn(), enforce: jest.fn() };
  const audit = { create: jest.fn() };
  const notices = {
    recordAssignment: jest.fn(),
    sendEmailAfterCommit: jest.fn(),
  };
  const push = {
    notifyAssignmentChanged: jest.fn(),
    notifyTeamsAssigned: jest.fn(),
  };
  let service: WalkInAssignmentService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue(edition);
    prisma.user.findFirst.mockResolvedValue(candidate);
    prisma.jurorAttendance.findMany.mockResolvedValue([]);
    prisma.evaluation.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      (run: (client: typeof tx) => unknown) => run(tx),
    );
    schedules.findForEdition.mockResolvedValue(schedule);
    validation.validate.mockResolvedValue({ blockers: [], warnings: [] });
    validation.enforce.mockImplementation(
      (...args: Parameters<AssignmentValidationService['enforce']>) =>
        AssignmentValidationService.prototype.enforce.apply({}, args),
    );
    notices.recordAssignment.mockResolvedValue(77);
    service = new WalkInAssignmentService(
      prisma as any,
      schedules as any,
      validation as any,
      audit as any,
      notices as any,
      push as any,
    );
    (service as any).logger = { error: jest.fn() };
  });

  describe('suggest', () => {
    it('solo atiende a un Suplente Junior confirmado de la edición activa', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const error = await service.suggest(JUROR_ID).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toMatchObject({
        code: 'NOT_A_JUNIOR_SUBSTITUTE',
      });
      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
        id: JUROR_ID,
        isActive: true,
        role: { name: 'Jurado' },
        jurorCategory: 'JUNIOR',
        jurorEditions: {
          some: { editionId: 5, type: 'BACKUP', status: 'CONFIRMED' },
        },
      });
    });

    it('solo mira grupos activos, confirmados, calificables y que el suplente no tiene', async () => {
      prisma.team.findMany.mockResolvedValue([]);

      await service.suggest(JUROR_ID, 3, BEFORE_CONTROL);

      const { where, select } = prisma.team.findMany.mock.calls[0][0];
      expect(where).toEqual({
        isActive: true,
        editionId: 5,
        videogame: { is: { videogameStatus: { status: 'CONFIRMADO' } } },
        notGradable: false,
        NOT: { assignedJurors: { some: { id: JUROR_ID } } },
      });
      // Los jurados que cuentan son los de la edición (HU-25).
      expect(select.assignedJurors.where.OR).toBeDefined();
    });

    it('antes de la hora de control cuenta a los asignados y propone el nivel con más faltantes', async () => {
      prisma.team.findMany.mockResolvedValue([
        suggestionTeam(1, 'N1-A', ['x', 'y']), // falta 1
        suggestionTeam(2, 'N2-A', ['x']), // faltan 2
        suggestionTeam(3, 'N2-B', []), // faltan 3
        suggestionTeam(4, 'N0-A', []), // colegios: no cuenta
      ]);

      const result = await service.suggest(JUROR_ID, 3, BEFORE_CONTROL);

      expect(result).toMatchObject({
        edition,
        phase: 'ALERT',
        basis: 'ASSIGNED',
        maxTeams: 3,
        level: 2,
        levelLabel: 'Nivel 2',
        reason: null,
      });
      expect(result.teams.map((t) => [t.codigo, t.faltantes])).toEqual([
        ['N2-B', 3],
        ['N2-A', 2],
      ]);
      expect(prisma.jurorAttendance.findMany).not.toHaveBeenCalled();
    });

    it('sin cronograma configurado cuenta a los asignados', async () => {
      schedules.findForEdition.mockResolvedValue({
        ...schedule,
        fairDate: null,
      });
      prisma.team.findMany.mockResolvedValue([
        suggestionTeam(1, 'N1-A', ['x']),
      ]);

      const result = await service.suggest(JUROR_ID, 3, AFTER_CONTROL);

      expect(result).toMatchObject({
        phase: 'NOT_CONFIGURED',
        basis: 'ASSIGNED',
      });
      expect(result.teams[0].juradosContados).toBe(1);
    });

    it('desde la hora de control cuenta solo a los presentes: con llegada o que ya evaluaron ese grupo', async () => {
      prisma.team.findMany.mockResolvedValue([
        suggestionTeam(1, 'N1-A', ['llego', 'ausente', 'evaluo']),
        suggestionTeam(2, 'N1-B', ['llego']),
      ]);
      prisma.jurorAttendance.findMany.mockResolvedValue([{ jurorId: 'llego' }]);
      prisma.evaluation.findMany.mockResolvedValue([
        { videogameId: 10, jurorId: 'evaluo' },
        // Evaluó otro grupo: no cuenta como presente en N1-B.
        { videogameId: 10, jurorId: 'otro' },
      ]);

      const result = await service.suggest(JUROR_ID, 3, AFTER_CONTROL);

      expect(result).toMatchObject({ phase: 'CONTROL', basis: 'PRESENT' });
      expect(
        result.teams.map((t) => [t.codigo, t.juradosContados, t.faltantes]),
      ).toEqual([
        ['N1-B', 1, 2],
        ['N1-A', 2, 1],
      ]);
      expect(prisma.evaluation.findMany.mock.calls[0][0].where).toEqual({
        editionId: 5,
        isActive: true,
        videogameId: { in: [10, 20] },
      });
    });

    it('respeta maxTeams y deja el resto del nivel para «Editar»', async () => {
      prisma.team.findMany.mockResolvedValue([
        suggestionTeam(1, 'N3-A', []),
        suggestionTeam(2, 'N3-B', []),
        suggestionTeam(3, 'N3-C', []),
      ]);

      const result = await service.suggest(JUROR_ID, 2, BEFORE_CONTROL);

      expect(result.teams.map((t) => t.codigo)).toEqual(['N3-A', 'N3-B']);
      expect(result.otherTeamsOfLevel.map((t) => t.codigo)).toEqual(['N3-C']);
    });

    it('sin grupos con faltantes lo informa y no propone nada', async () => {
      prisma.team.findMany.mockResolvedValue([
        suggestionTeam(1, 'N1-A', ['a', 'b', 'c']),
      ]);

      const result = await service.suggest(JUROR_ID, 3, BEFORE_CONTROL);

      expect(result).toMatchObject({
        level: null,
        levelLabel: null,
        teams: [],
        otherTeamsOfLevel: [],
        reason: 'NO_SHORTAGE',
      });
    });
  });

  describe('assign', () => {
    const assign = (teamIds: number[], confirmWarnings = false) =>
      service.assign(JUROR_ID, { teamIds, confirmWarnings }, ADMIN_ID);

    it('solo suma: conecta al suplente sin quitar a los jurados del grupo', async () => {
      prisma.team.findMany.mockResolvedValue([
        assignTeam(12, 'N1-A'),
        assignTeam(15, 'N1-B'),
      ]);

      const result = await assign([15, 12]);

      expect(tx.team.update.mock.calls.map((c) => c[0])).toEqual([
        {
          where: { id: 15 },
          data: { assignedJurors: { connect: { id: JUROR_ID } } },
        },
        {
          where: { id: 12 },
          data: { assignedJurors: { connect: { id: JUROR_ID } } },
        },
      ]);
      const data = JSON.stringify(tx.team.update.mock.calls);
      expect(data).not.toMatch(/disconnect|"set"/);
      expect(result).toEqual({
        message: 'Se asignaron 2 grupos a Laura Gómez. Nadie perdió grupos.',
        edicion: edition,
        jurado: { id: JUROR_ID, nombre: 'Laura Gómez' },
        equiposAgregados: [
          { id: 15, codigo: 'N1-B', nombre: 'Equipo N1-B' },
          { id: 12, codigo: 'N1-A', nombre: 'Equipo N1-A' },
        ],
        equiposYaAsignados: [],
        advertenciasAceptadas: [],
      });
    });

    it('deja una fila de bitácora por grupo y el aviso de HU-22 en la transacción; push y correo después', async () => {
      prisma.team.findMany.mockResolvedValue([assignTeam(12, 'N1-A')]);

      await assign([12]);

      expect(audit.create).toHaveBeenCalledWith(
        {
          action: 'ASSIGN',
          actorUserId: ADMIN_ID,
          teamId: 12,
          jurorId: JUROR_ID,
          newJurorId: JUROR_ID,
          notes: 'Suplente con asignación automática de grupos (HU-24).',
        },
        tx,
      );
      expect(notices.recordAssignment).toHaveBeenCalledWith(tx, {
        jurorId: JUROR_ID,
        teamIds: [12],
        editionId: 5,
      });
      expect(push.notifyTeamsAssigned).toHaveBeenCalledWith([
        { jurorId: JUROR_ID, teamId: 12 },
      ]);
      expect(notices.sendEmailAfterCommit).toHaveBeenCalledWith([77]);
    });

    it('valida con HU-08 al suplente como Junior de la edición, solo sobre los grupos nuevos', async () => {
      prisma.team.findMany.mockResolvedValue([
        assignTeam(12, 'N1-A'),
        assignTeam(15, 'N1-B', [JUROR_ID]),
      ]);

      const result = await assign([12, 15]);

      expect(validation.validate).toHaveBeenCalledWith({
        activeEdition: edition,
        teams: [
          {
            id: 12,
            teamCode: 'N1-A',
            editionId: 5,
            editionTitle: edition.title,
            jurorIds: ['j-a', 'j-b'],
          },
        ],
        evaluators: [
          {
            id: JUROR_ID,
            name: 'Laura Gómez',
            kind: 'JUROR',
            jurorCategory: 'JUNIOR',
            participatesInActiveEdition: true,
          },
        ],
        changes: [{ type: 'ADD', jurorId: JUROR_ID, teamId: 12 }],
      });
      expect(result.equiposYaAsignados).toEqual([
        { id: 15, codigo: 'N1-B', nombre: 'Equipo N1-B' },
      ]);
      expect(tx.team.update).toHaveBeenCalledTimes(1);
    });

    it('si ya tenía todos los grupos no abre transacción ni avisa', async () => {
      prisma.team.findMany.mockResolvedValue([
        assignTeam(12, 'N1-A', [JUROR_ID]),
      ]);

      const result = await assign([12]);

      expect(result.message).toContain('No había grupos nuevos');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(push.notifyTeamsAssigned).not.toHaveBeenCalled();
    });

    it('un bloqueo de HU-08 (colegio para un junior) responde 400 y no guarda nada', async () => {
      prisma.team.findMany.mockResolvedValue([assignTeam(9, 'N0-A')]);
      validation.validate.mockResolvedValue({
        blockers: [
          {
            code: 'SCHOOL_REQUIRES_SENIOR',
            message: 'Colegios solo con senior',
            teamId: 9,
          },
        ],
        warnings: [],
      });

      const error = await assign([9]).catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({
        code: 'SCHOOL_REQUIRES_SENIOR',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('un grupo sin confirmar o no calificable responde 400 antes de validar', async () => {
      prisma.team.findMany.mockResolvedValue([
        assignTeam(12, 'N1-A', [], {
          videogame: { videogameStatus: { status: 'PENDIENTE' } },
        }),
      ]);

      const error = await assign([12]).catch((e) => e);

      expect(error.getResponse()).toMatchObject({ code: 'TEAM_NOT_CONFIRMED' });
      expect(validation.validate).not.toHaveBeenCalled();
    });

    it('advertencias: 409 ASSIGNMENT_WARNINGS; con confirmWarnings guarda y las anota en la bitácora', async () => {
      prisma.team.findMany.mockResolvedValue([assignTeam(12, 'N1-A')]);
      const warning = {
        code: 'JUROR_MIXED_LEVELS',
        message: 'Queda con grupos de distintos niveles',
      };
      validation.validate.mockResolvedValue({
        blockers: [],
        warnings: [warning],
      });

      const error = await assign([12]).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        code: 'ASSIGNMENT_WARNINGS',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();

      const result = await assign([12], true);
      expect(result.advertenciasAceptadas).toEqual([warning]);
      expect(audit.create.mock.calls[0][0].notes).toBe(
        'Suplente con asignación automática de grupos (HU-24). Advertencias aceptadas: JUROR_MIXED_LEVELS.',
      );
    });

    it('un grupo que no existe o está inactivo responde 404 TEAM_NOT_FOUND', async () => {
      prisma.team.findMany.mockResolvedValue([assignTeam(12, 'N1-A')]);

      const error = await assign([12, 99]).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toMatchObject({
        code: 'TEAM_NOT_FOUND',
        teamIds: [99],
      });
    });

    it('si el jurado no es Suplente Junior de la edición responde 404 sin tocar grupos', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const error = await assign([12]).catch((e) => e);

      expect(error.getResponse()).toMatchObject({
        code: 'NOT_A_JUNIOR_SUBSTITUTE',
      });
      expect(prisma.team.findMany).not.toHaveBeenCalled();
    });

    it('si falla la transacción responde 500 en español y no avisa', async () => {
      prisma.team.findMany.mockResolvedValue([assignTeam(12, 'N1-A')]);
      tx.team.update.mockRejectedValue(new Error('boom'));

      const error = await assign([12]).catch((e) => e);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect(error.message).toContain('no cambió ninguna asignación');
      expect(push.notifyTeamsAssigned).not.toHaveBeenCalled();
      expect(notices.sendEmailAfterCommit).not.toHaveBeenCalled();
    });
  });
});
