import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentValidationService } from '../assignment-validation/assignment-validation.service';
import { BulkAssignTeamsDto } from '../dto/bulk-assign-teams.dto';
import { JurorAssignmentBulkService } from './juror-assignment-bulk.service';
import { JurorAssignmentService } from './juror-assignment.service';

/**
 * HU-42 (ARK-275): asignación en lote. Usa los servicios reales de asignación y de validación
 * (reglas de HU-08) con la BD simulada, para comprobar que se aplican las mismas validaciones
 * que en `assign`.
 */
const ADMIN = 'admin-1';
const JUROR = 'juror-1';
const EDITION = { id: 5, title: 'Feria', status: 'ACTIVE' };

type TeamSeed = {
  id: number;
  code?: string;
  status?: string;
  notGradable?: boolean;
  editionId?: number;
  jurors?: string[];
};

describe('JurorAssignmentBulkService (HU-42)', () => {
  const teams = new Map<number, ReturnType<typeof teamRow>>();
  let existingTeamsOfJuror: {
    id: number;
    teamCode: string;
    editionId: number;
  }[];
  let evaluator: Record<string, unknown>;

  const teamRow = (seed: TeamSeed) => ({
    id: seed.id,
    isActive: true,
    teamCode: seed.code ?? `N1-A-0${seed.id}`,
    teamName: `Equipo ${seed.id}`,
    editionId: seed.editionId ?? EDITION.id,
    notGradable: seed.notGradable ?? false,
    edition: { status: 'ACTIVE', title: 'Feria' },
    videogame: {
      id: seed.id * 10,
      name: `Juego ${seed.id}`,
      videogameStatus: { status: seed.status ?? 'CONFIRMADO' },
    },
    assignedJurors: (seed.jurors ?? ['otro-1', 'otro-2']).map((id) => ({
      id,
      roleId: 4,
    })),
  });
  const seedTeams = (...seeds: TeamSeed[]) => {
    teams.clear();
    for (const seed of seeds) teams.set(seed.id, teamRow(seed));
  };

  let prisma: {
    edition: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    team: { findUnique: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: { team: { update: jest.Mock } };
  let audit: { create: jest.Mock };
  let notices: { recordAssignment: jest.Mock; sendEmailAfterCommit: jest.Mock };
  let push: { notifyAssignmentChanged: jest.Mock };
  let service: JurorAssignmentBulkService;

  const run = (teamIds: number[], confirmWarnings?: boolean) =>
    service.assignMany(
      { jurorId: JUROR, teamIds, confirmWarnings } as BulkAssignTeamsDto,
      ADMIN,
    );

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    existingTeamsOfJuror = [];
    evaluator = {
      id: JUROR,
      isActive: true,
      roleId: 4,
      jurorCategory: 'JUNIOR',
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@x.co',
      role: { name: 'Jurado' },
    };
    seedTeams({ id: 1 }, { id: 2 }, { id: 3 });
    tx = { team: { update: jest.fn().mockResolvedValue({}) } };
    prisma = {
      edition: { findFirst: jest.fn().mockResolvedValue(EDITION) },
      user: {
        findUnique: jest.fn(() => Promise.resolve(evaluator)),
        findFirst: jest.fn().mockResolvedValue({ id: JUROR }), // participa en la edición
        findMany: jest.fn().mockResolvedValue([{ id: JUROR, managedNrcs: [] }]),
      },
      team: {
        findUnique: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(teams.get(where.id) ?? null),
        ),
        // Carga de datos de las advertencias: grupos que ya tiene el jurado y NRC de los integrantes.
        findMany: jest.fn((args: { where: Record<string, unknown> }) =>
          Promise.resolve(
            'assignedJurors' in args.where
              ? existingTeamsOfJuror.map((team) => ({
                  ...team,
                  assignedJurors: [{ id: JUROR }],
                }))
              : [],
          ),
        ),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    audit = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    notices = {
      recordAssignment: jest.fn().mockResolvedValue(77),
      sendEmailAfterCommit: jest.fn(),
    };
    push = { notifyAssignmentChanged: jest.fn() };
    const validation = new AssignmentValidationService(prisma as never);
    const assignments = new JurorAssignmentService(
      prisma as never,
      audit as never,
      validation,
      push as never,
      notices as never,
    );
    Object.assign(assignments, { professorRoleId: 3, jurorRoleId: 4 });
    service = new JurorAssignmentBulkService(
      prisma as never,
      assignments,
      audit as never,
      validation,
      push as never,
      notices as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('todos los equipos son válidos', () => {
    it('los asigna en una sola transacción, con una fila de bitácora por equipo', async () => {
      const result = await run([1, 2]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(
        (tx.team.update.mock.calls as [{ where: { id: number } }][]).map(
          (call) => call[0].where.id,
        ),
      ).toEqual([1, 2]);
      expect(tx.team.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { assignedJurors: { connect: { id: JUROR } } },
      });
      expect(audit.create).toHaveBeenCalledTimes(2);
      expect(audit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ASSIGN',
          actorUserId: ADMIN,
          teamId: 2,
          jurorId: JUROR,
          newJurorId: JUROR,
          notes: 'Asignación manual en lote desde módulo admin.',
        }),
        tx,
      );
      expect(result.totales).toEqual({
        solicitados: 2,
        asignados: 2,
        bloqueados: 0,
      });
      expect(result.resultados).toEqual([
        expect.objectContaining({
          equipoId: 1,
          estado: 'ASSIGNED',
          cantidadJurados: 3,
          bloqueo: null,
          advertencias: [],
        }),
        expect.objectContaining({ equipoId: 2, estado: 'ASSIGNED' }),
      ]);
      expect(result.jurado).toEqual({ id: JUROR, nombre: 'Ana Pérez' });
      expect(result.message).toBe('Se asignaron 2 equipos al jurado.');
    });

    it('avisa UNA sola vez al jurado y UNA vez al suplente con todos sus equipos, después de confirmar', async () => {
      await run([1, 2, 3]);

      expect(push.notifyAssignmentChanged).toHaveBeenCalledTimes(1);
      expect(push.notifyAssignmentChanged).toHaveBeenCalledWith([JUROR]);
      expect(
        push.notifyAssignmentChanged.mock.invocationCallOrder[0],
      ).toBeGreaterThan(prisma.$transaction.mock.invocationCallOrder[0]);
      expect(notices.recordAssignment).toHaveBeenCalledTimes(1);
      expect(notices.recordAssignment).toHaveBeenCalledWith(tx, {
        jurorId: JUROR,
        teamIds: [1, 2, 3],
        editionId: 5,
      });
      expect(notices.sendEmailAfterCommit).toHaveBeenCalledTimes(1);
      expect(notices.sendEmailAfterCommit).toHaveBeenCalledWith([77]);
    });

    it('ignora los ids repetidos', async () => {
      const result = await run([1, 1, 2]);
      expect(result.totales.solicitados).toBe(2);
      expect(tx.team.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('equipos bloqueados: no frenan a los demás', () => {
    it('un equipo sin confirmar, otro inexistente y otro de otra edición salen BLOCKED con su motivo', async () => {
      seedTeams(
        { id: 1 },
        { id: 2, status: 'PENDIENTE' },
        { id: 4, editionId: 4 },
      );

      const result = await run([1, 2, 3, 4]);

      expect(
        result.resultados.map((r) => [r.equipoId, r.estado, r.bloqueo?.code]),
      ).toEqual([
        [1, 'ASSIGNED', undefined],
        [2, 'BLOCKED', 'TEAM_NOT_CONFIRMED'],
        [3, 'BLOCKED', 'TEAM_NOT_FOUND'],
        [4, 'BLOCKED', 'EDITION_READ_ONLY'],
      ]);
      expect(result.resultados[1].bloqueo?.message).toContain('N1-A-02');
      expect(result.resultados[1]).toMatchObject({
        codigo: 'N1-A-02',
        cantidadJurados: null,
        advertencias: [],
      });
      expect(result.resultados[2]).toMatchObject({
        codigo: null,
        nombre: null,
      });
      expect(result.totales).toEqual({
        solicitados: 4,
        asignados: 1,
        bloqueados: 3,
      });
      // Solo se guardó el equipo 1.
      expect(tx.team.update).toHaveBeenCalledTimes(1);
      expect(audit.create).toHaveBeenCalledTimes(1);
      expect(notices.recordAssignment).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ teamIds: [1] }),
      );
    });

    it('un equipo no calificable (presentador externo) sale BLOCKED', async () => {
      seedTeams({ id: 1 }, { id: 2, notGradable: true });
      const result = await run([1, 2]);
      expect(result.resultados[1]).toMatchObject({
        estado: 'BLOCKED',
        bloqueo: { code: 'TEAM_NOT_GRADABLE' },
      });
    });

    it('un equipo donde el jurado ya está asignado sale BLOCKED (DUPLICATE_ASSIGNMENT) y los demás siguen', async () => {
      seedTeams({ id: 1 }, { id: 2, jurors: ['otro-1', JUROR] });
      const result = await run([1, 2]);
      expect(
        result.resultados.map((r) => [r.equipoId, r.estado, r.bloqueo?.code]),
      ).toEqual([
        [1, 'ASSIGNED', undefined],
        [2, 'BLOCKED', 'DUPLICATE_ASSIGNMENT'],
      ]);
    });

    it('un jurado junior en un colegio (nivel 0) sale BLOCKED; en los demás niveles se asigna', async () => {
      seedTeams({ id: 1, code: 'N0-COLEGIOS-01' }, { id: 2 });
      const result = await run([1, 2]);
      expect(
        result.resultados.map((r) => [r.equipoId, r.estado, r.bloqueo?.code]),
      ).toEqual([
        [1, 'BLOCKED', 'SCHOOL_REQUIRES_SENIOR'],
        [2, 'ASSIGNED', undefined],
      ]);
    });

    it('las advertencias se calculan solo con los equipos que sí se asignan', async () => {
      // Con los 4 equipos el jurado quedaría con 4 grupos (advertencia); sin los 2 bloqueados, con 2.
      seedTeams(
        { id: 1 },
        { id: 2 },
        { id: 3, status: 'PENDIENTE' },
        { id: 4, status: 'RECHAZADO' },
      );
      const result = await run([1, 2, 3, 4]);
      expect(result.totales.asignados).toBe(2);
      expect(result.advertenciasAceptadas).toEqual([]);
    });

    it('si TODOS quedan bloqueados responde con todos en BLOCKED y no guarda ni avisa nada', async () => {
      seedTeams(
        { id: 1, status: 'PENDIENTE' },
        { id: 2, code: 'N0-COLEGIOS-02' },
      );

      const result = await run([1, 2, 9]);

      expect(result.totales).toEqual({
        solicitados: 3,
        asignados: 0,
        bloqueados: 3,
      });
      expect(result.resultados.every((r) => r.estado === 'BLOCKED')).toBe(true);
      expect(result.message).toBe(
        'No se asignó ningún equipo: 3 equipos tienen un bloqueo.',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(push.notifyAssignmentChanged).not.toHaveBeenCalled();
      expect(notices.sendEmailAfterCommit).not.toHaveBeenCalled();
    });
  });

  describe('advertencias de HU-08', () => {
    beforeEach(() => {
      // El jurado ya tiene 2 grupos: con 2 más queda en 4 (máximo recomendado, 3).
      existingTeamsOfJuror = [
        { id: 20, teamCode: 'N1-A-20', editionId: 5 },
        { id: 21, teamCode: 'N1-A-21', editionId: 5 },
      ];
    });

    it('sin confirmWarnings: 409 ASSIGNMENT_WARNINGS con las advertencias y los equipos bloqueados, sin guardar nada', async () => {
      seedTeams({ id: 1 }, { id: 2 }, { id: 3, status: 'PENDIENTE' });

      const error = await run([1, 2, 3]).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as Record<
        string,
        any
      >;
      expect(body).toMatchObject({
        statusCode: 409,
        code: 'ASSIGNMENT_WARNINGS',
        warnings: [
          expect.objectContaining({ code: 'JUROR_OVER_LIMIT', jurorId: JUROR }),
        ],
        blocked: [
          expect.objectContaining({
            teamId: 3,
            codigo: 'N1-A-03',
            code: 'TEAM_NOT_CONFIRMED',
          }),
        ],
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.create).not.toHaveBeenCalled();
      expect(push.notifyAssignmentChanged).not.toHaveBeenCalled();
      expect(notices.recordAssignment).not.toHaveBeenCalled();
    });

    it('con confirmWarnings guarda, marca los equipos ASSIGNED_WITH_WARNINGS y deja las advertencias en la bitácora', async () => {
      seedTeams({ id: 1 }, { id: 2 });

      const result = await run([1, 2], true);

      expect(result.resultados.map((r) => r.estado)).toEqual([
        'ASSIGNED_WITH_WARNINGS',
        'ASSIGNED_WITH_WARNINGS',
      ]);
      expect(result.resultados[0].advertencias[0].code).toBe(
        'JUROR_OVER_LIMIT',
      );
      expect(result.advertenciasAceptadas).toHaveLength(1);
      expect(audit.create).toHaveBeenCalledTimes(2);
      expect(
        (audit.create.mock.calls as [{ notes: string }][])[0][0].notes,
      ).toBe(
        'Asignación manual en lote desde módulo admin. Advertencias aceptadas: JUROR_OVER_LIMIT.',
      );
      expect(push.notifyAssignmentChanged).toHaveBeenCalledTimes(1);
    });

    it('si todos los equipos están bloqueados no hay advertencias que confirmar (200, sin 409)', async () => {
      seedTeams({ id: 1, status: 'PENDIENTE' });
      const result = await run([1]);
      expect(result.totales.asignados).toBe(0);
    });
  });

  describe('problemas del jurado: frenan todo y no se guarda nada', () => {
    it('el jurado no existe → 404', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(run([1, 2])).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('el usuario no es jurado ni profesor → 400', async () => {
      evaluator = { ...evaluator, roleId: 2, role: { name: 'Estudiante' } };
      await expect(run([1])).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('el jurado no participa en la edición activa → 400 EVALUATOR_NOT_IN_EDITION, como assign', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const error = await run([1, 2]).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'EVALUATOR_NOT_IN_EDITION',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('el jurado no tiene categoría → 400 MISSING_JUROR_CATEGORY', async () => {
      evaluator = { ...evaluator, jurorCategory: null };
      const error = await run([1]).catch((e: unknown) => e);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'MISSING_JUROR_CATEGORY',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sin edición activa → 404', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      await expect(run([1])).rejects.toThrow(NotFoundException);
    });
  });

  describe('si falla al guardar, no se asigna ningún equipo', () => {
    it('un error de la BD dentro de la transacción da 500 y no avisa a nadie', async () => {
      audit.create.mockRejectedValueOnce(new Error('se cayó la conexión'));

      await expect(run([1, 2])).rejects.toThrow(InternalServerErrorException);

      // La transacción es una sola: el rollback deja todo como estaba.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(push.notifyAssignmentChanged).not.toHaveBeenCalled();
      expect(notices.sendEmailAfterCommit).not.toHaveBeenCalled();
    });

    it('el mensaje del 500 no filtra el error interno', async () => {
      tx.team.update.mockRejectedValueOnce(new Error('detalle interno'));
      const error = await run([1]).catch((e: Error) => e);
      expect((error as Error).message).not.toContain('detalle interno');
    });
  });
});
