import { Logger } from '@nestjs/common';
import { ManualJurorAssignmentAction } from '@prisma/client';

import {
  AssignmentRulesInput,
  AssignmentValidationResult,
} from '../assignment-validation/assignment-rules.types';
import { AssignmentValidationService } from '../assignment-validation/assignment-validation.service';
import {
  NO_TEAMS_TO_COVER,
  NOT_A_SUBSTITUTE,
  NOT_AN_EVALUATOR,
  SUBSTITUTE_BULK_AUDIT_NOTE,
  SUBSTITUTE_IS_COVERED_JUROR,
  SubstituteAssignmentService,
} from './substitute-assignment.service';

/**
 * HU-09 (ARK-215): suplentes en lote. Solo suma (nunca quita), omite los pares que ya existen,
 * valida todos los pares nuevos juntos con HU-08 y guarda todo en una sola transacción con
 * bitácora y un aviso de HU-22 por suplente.
 */
const ADMIN = 'admin-1';
const EDITION = { id: 5, title: 'Feria' };

type TeamRow = {
  id: number;
  teamCode: string;
  teamName: string;
  editionId: number;
  notGradable: boolean;
  videogame: { videogameStatus: { status: string } } | null;
  assignedJurors: Array<{ id: string }>;
};

const team = (
  id: number,
  jurorIds: string[],
  extra: Partial<TeamRow> = {},
): TeamRow => ({
  id,
  teamCode: `N1-T-${id}`,
  teamName: `Equipo ${id}`,
  editionId: EDITION.id,
  notGradable: false,
  videogame: { videogameStatus: { status: 'CONFIRMADO' } },
  assignedJurors: jurorIds.map((jurorId) => ({ id: jurorId })),
  ...extra,
});

type UserQuery = { where: { id: { in: string[] }; jurorEditions?: unknown } };

const person = (id: string) => ({ id, firstName: 'Nombre', lastName: id });
const substitute = (id: string) => ({ ...person(id), jurorCategory: 'JUNIOR' });

describe('SubstituteAssignmentService (HU-09)', () => {
  let tx: { team: { update: jest.Mock } };
  let prisma: {
    edition: { findFirst: jest.Mock };
    user: { findMany: jest.Mock<Promise<unknown[]>, [UserQuery]> };
    team: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { create: jest.Mock };
  let validation: AssignmentValidationService;
  let validate: jest.SpyInstance<
    Promise<AssignmentValidationResult>,
    [AssignmentRulesInput]
  >;
  let push: {
    notifyAssignmentChanged: jest.Mock;
    notifyTeamsAssigned: jest.Mock;
  };
  let notices: { recordAssignment: jest.Mock; sendEmailAfterCommit: jest.Mock };
  let service: SubstituteAssignmentService;

  /** Cuentas que existen: jurados a cubrir y suplentes válidos. */
  let evaluators: string[];
  let substitutes: string[];
  let teams: TeamRow[];

  beforeEach(() => {
    evaluators = ['j1', 'j2'];
    substitutes = ['s1', 's2'];
    teams = [team(1, ['j1', 'x']), team(2, ['j1', 'j2']), team(3, ['j2'])];

    tx = { team: { update: jest.fn().mockResolvedValue({}) } };
    prisma = {
      edition: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ ...EDITION, status: 'ACTIVE' }),
      },
      user: {
        // La consulta de suplentes filtra por `jurorEditions`; la de jurados, no.
        findMany: jest.fn(({ where }: UserQuery) => {
          const pool = where.jurorEditions ? substitutes : evaluators;
          return Promise.resolve<unknown[]>(
            where.id.in
              .filter((id) => pool.includes(id))
              .map(where.jurorEditions ? substitute : person),
          );
        }),
      },
      team: { findMany: jest.fn(() => Promise.resolve(teams)) },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    audit = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    validation = new AssignmentValidationService({} as any);
    validate = jest
      .spyOn(validation, 'validate')
      .mockResolvedValue({ blockers: [], warnings: [] });
    push = {
      notifyAssignmentChanged: jest.fn(),
      notifyTeamsAssigned: jest.fn(),
    };
    notices = {
      recordAssignment: jest.fn(
        (_tx: unknown, { jurorId }: { jurorId: string }) =>
          Promise.resolve(jurorId === 's1' ? 101 : 102),
      ),
      sendEmailAfterCommit: jest.fn(),
    };
    service = new SubstituteAssignmentService(
      prisma as any,
      audit as any,
      validation,
      push as any,
      notices as any,
    );
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  const run = (
    body: Partial<{
      jurorIds: string[];
      substituteIds: string[];
      confirmWarnings: boolean;
    }> = {},
  ) =>
    service.assignToJurorsTeams(
      { jurorIds: ['j1', 'j2'], substituteIds: ['s1', 's2'], ...body },
      ADMIN,
    );

  const nothingSaved = () => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.team.update).not.toHaveBeenCalled();
    expect(audit.create).not.toHaveBeenCalled();
    expect(notices.recordAssignment).not.toHaveBeenCalled();
    expect(push.notifyTeamsAssigned).not.toHaveBeenCalled();
    expect(notices.sendEmailAfterCommit).not.toHaveBeenCalled();
  };

  it('suma cada suplente a la unión de grupos de los jurados (sin repetir el grupo compartido)', async () => {
    const result = await run();

    // Grupos activos de la edición activa de cualquiera de los jurados
    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          editionId: EDITION.id,
          assignedJurors: { some: { id: { in: ['j1', 'j2'] } } },
        },
      }),
    );
    expect(tx.team.update).toHaveBeenCalledTimes(3);
    for (const teamId of [1, 2, 3]) {
      expect(tx.team.update).toHaveBeenCalledWith({
        where: { id: teamId },
        data: { assignedJurors: { connect: [{ id: 's1' }, { id: 's2' }] } },
      });
    }
    expect(result.totales).toEqual({
      equiposCubiertos: 3,
      asignacionesAgregadas: 6,
      asignacionesOmitidas: 0,
    });
    expect(
      result.suplentes.map((s) => [s.id, s.equiposAgregados.map((t) => t.id)]),
    ).toEqual([
      ['s1', [1, 2, 3]],
      ['s2', [1, 2, 3]],
    ]);
    expect(result.juradosCubiertos).toEqual([
      { id: 'j1', nombre: 'Nombre j1', equiposCubiertos: 2 },
      { id: 'j2', nombre: 'Nombre j2', equiposCubiertos: 2 },
    ]);
    expect(result.message).toBe(
      'Se agregaron 6 asignaciones de suplentes en 3 grupos. Nadie perdió grupos.',
    );
  });

  it('nunca quita: solo `connect`, sin `disconnect` ni `set`', async () => {
    await run();

    for (const [arg] of tx.team.update.mock.calls as Array<
      [{ data: { assignedJurors: object } }]
    >) {
      expect(Object.keys(arg.data.assignedJurors)).toEqual(['connect']);
    }
  });

  it('valida con HU-08 todos los pares nuevos a la vez, con los jurados actuales de cada grupo', async () => {
    await run();

    expect(validate).toHaveBeenCalledTimes(1);
    const input = validate.mock.calls[0][0];
    expect(input.activeEdition).toEqual(EDITION);
    expect(input.teams.map((t) => [t.id, t.jurorIds])).toEqual([
      [1, ['j1', 'x']],
      [2, ['j1', 'j2']],
      [3, ['j2']],
    ]);
    expect(input.evaluators).toEqual([
      expect.objectContaining({
        id: 's1',
        kind: 'JUROR',
        jurorCategory: 'JUNIOR',
        participatesInActiveEdition: true,
      }),
      expect.objectContaining({
        id: 's2',
        kind: 'JUROR',
        participatesInActiveEdition: true,
      }),
    ]);
    expect(input.changes).toHaveLength(6);
    expect(input.changes[0]).toEqual({ type: 'ADD', jurorId: 's1', teamId: 1 });
  });

  it('una fila de bitácora ASSIGN por par, dentro de la transacción, con los jurados cubiertos', async () => {
    await run();

    expect(audit.create).toHaveBeenCalledTimes(6);
    expect(audit.create).toHaveBeenCalledWith(
      {
        action: ManualJurorAssignmentAction.ASSIGN,
        actorUserId: ADMIN,
        teamId: 2,
        jurorId: 's1',
        newJurorId: 's1',
        notes: `${SUBSTITUTE_BULK_AUDIT_NOTE} Cubre a Nombre j1 (j1), Nombre j2 (j2).`,
      },
      tx,
    );
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 1,
        jurorId: 's2',
        notes: `${SUBSTITUTE_BULK_AUDIT_NOTE} Cubre a Nombre j1 (j1).`,
      }),
      tx,
    );
  });

  it('un aviso de HU-22 por suplente con todos sus grupos nuevos; push y correo después de confirmar', async () => {
    await run();

    expect(notices.recordAssignment).toHaveBeenCalledTimes(2);
    expect(notices.recordAssignment).toHaveBeenCalledWith(tx, {
      jurorId: 's1',
      teamIds: [1, 2, 3],
      editionId: EDITION.id,
    });
    expect(notices.recordAssignment).toHaveBeenCalledWith(tx, {
      jurorId: 's2',
      teamIds: [1, 2, 3],
      editionId: EDITION.id,
    });
    expect(notices.sendEmailAfterCommit).toHaveBeenCalledWith([101, 102]);
    // HU-51: un solo aviso con los grupos nuevos de cada suplente.
    expect(push.notifyTeamsAssigned).toHaveBeenCalledTimes(1);
    expect(push.notifyTeamsAssigned.mock.calls[0][0]).toEqual(
      ['s1', 's2'].flatMap((jurorId) =>
        [1, 2, 3].map((teamId) => ({ jurorId, teamId })),
      ),
    );
    expect(
      notices.sendEmailAfterCommit.mock.invocationCallOrder[0],
    ).toBeGreaterThan(prisma.$transaction.mock.invocationCallOrder[0]);
  });

  it('omite los pares que ya existen sin fallar (ni en HU-08, ni en la bitácora, ni en el aviso)', async () => {
    teams = [team(1, ['j1', 's1']), team(2, ['j1'])];

    const result = await run({ jurorIds: ['j1'], substituteIds: ['s1'] });

    expect(validate.mock.calls[0][0].changes).toEqual([
      { type: 'ADD', jurorId: 's1', teamId: 2 },
    ]);
    expect(tx.team.update).toHaveBeenCalledTimes(1);
    expect(audit.create).toHaveBeenCalledTimes(1);
    expect(notices.recordAssignment).toHaveBeenCalledWith(tx, {
      jurorId: 's1',
      teamIds: [2],
      editionId: EDITION.id,
    });
    expect(result.suplentes[0].equiposYaAsignados.map((t) => t.id)).toEqual([
      1,
    ]);
    expect(result.totales).toEqual({
      equiposCubiertos: 2,
      asignacionesAgregadas: 1,
      asignacionesOmitidas: 1,
    });
  });

  it('si no hay nada nuevo responde sin error y no guarda, ni avisa', async () => {
    teams = [team(1, ['j1', 's1'])];

    const result = await run({ jurorIds: ['j1'], substituteIds: ['s1'] });

    expect(validate).not.toHaveBeenCalled();
    nothingSaved();
    expect(result.totales.asignacionesAgregadas).toBe(0);
    expect(result.message).toContain('No había asignaciones nuevas');
  });

  it('el suplente que ya tenía todos los grupos no recibe aviso; el otro sí', async () => {
    teams = [team(1, ['j1', 's1'])];

    await run({ jurorIds: ['j1'] });

    expect(notices.recordAssignment).toHaveBeenCalledTimes(1);
    expect(notices.recordAssignment).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ jurorId: 's2' }),
    );
    expect(push.notifyTeamsAssigned).toHaveBeenCalledWith([
      { jurorId: 's2', teamId: 1 },
    ]);
  });

  it(`400 ${NOT_A_SUBSTITUTE} si algún id no es suplente confirmado de la edición; nada cambia`, async () => {
    substitutes = ['s1'];

    await expect(run()).rejects.toMatchObject({
      status: 400,
      response: { code: NOT_A_SUBSTITUTE, substituteIds: ['s2'] },
    });
    const [query] = prisma.user.findMany.mock.calls.find(
      ([arg]) => arg.where.jurorEditions,
    )!;
    expect(query.where).toMatchObject({
      isActive: true,
      role: { name: 'Jurado' },
      jurorEditions: {
        some: { editionId: EDITION.id, type: 'BACKUP', status: 'CONFIRMED' },
      },
    });
    nothingSaved();
  });

  it(`400 ${NOT_AN_EVALUATOR} si algún jurado a cubrir no existe o no es jurado ni profesor`, async () => {
    evaluators = ['j1'];

    await expect(run()).rejects.toMatchObject({
      status: 400,
      response: { code: NOT_AN_EVALUATOR, jurorIds: ['j2'] },
    });
    nothingSaved();
  });

  it(`400 ${SUBSTITUTE_IS_COVERED_JUROR} si el mismo usuario está en las dos listas`, async () => {
    await expect(run({ substituteIds: ['s1', 'j2'] })).rejects.toMatchObject({
      status: 400,
      response: { code: SUBSTITUTE_IS_COVERED_JUROR, ids: ['j2'] },
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    nothingSaved();
  });

  it(`400 ${NO_TEAMS_TO_COVER} si los jurados no tienen grupos en la edición activa`, async () => {
    teams = [];

    await expect(run()).rejects.toMatchObject({
      status: 400,
      response: { code: NO_TEAMS_TO_COVER },
    });
    nothingSaved();
  });

  it('omite e informa los grupos sin confirmar o no calificables; informa los jurados sin grupos', async () => {
    teams = [
      team(1, ['j1']),
      team(2, ['j1'], {
        videogame: { videogameStatus: { status: 'PENDIENTE' } },
      }),
      team(3, ['j1'], { notGradable: true }),
    ];

    const result = await run({ substituteIds: ['s1'] });

    expect(validate.mock.calls[0][0].changes).toEqual([
      { type: 'ADD', jurorId: 's1', teamId: 1 },
    ]);
    expect(result.equiposNoAsignables).toEqual([
      {
        id: 2,
        codigo: 'N1-T-2',
        nombre: 'Equipo 2',
        motivo: 'TEAM_NOT_CONFIRMED',
      },
      {
        id: 3,
        codigo: 'N1-T-3',
        nombre: 'Equipo 3',
        motivo: 'TEAM_NOT_GRADABLE',
      },
    ]);
    expect(result.juradosSinGrupos).toEqual([
      { id: 'j2', nombre: 'Nombre j2' },
    ]);
  });

  it('solo grupos sin confirmar: 400 NO_TEAMS_TO_COVER', async () => {
    teams = [team(2, ['j1'], { videogame: null })];

    await expect(run()).rejects.toMatchObject({
      response: { code: NO_TEAMS_TO_COVER },
    });
    nothingSaved();
  });

  describe('advertencias de HU-08', () => {
    const warning = {
      code: 'JUROR_OVER_LIMIT' as const,
      message:
        'El jurado junior s1 quedaría con 6 grupos; el máximo recomendado es 3 por jurado.',
      jurorId: 's1',
    };

    beforeEach(() => {
      validate.mockResolvedValue({ blockers: [], warnings: [warning] });
    });

    it('sin confirmar: 409 ASSIGNMENT_WARNINGS con la misma forma que asignar, y no guarda nada', async () => {
      await expect(run()).rejects.toMatchObject({
        status: 409,
        response: {
          statusCode: 409,
          code: 'ASSIGNMENT_WARNINGS',
          warnings: [warning],
        },
      });
      nothingSaved();
    });

    it('confirmadas: guarda y anota en la bitácora las advertencias aceptadas', async () => {
      const result = await run({ confirmWarnings: true });

      expect(result.advertenciasAceptadas).toEqual([warning]);
      expect(audit.create).toHaveBeenCalledTimes(6);
      expect(
        (audit.create.mock.calls[0] as [{ notes: string }])[0].notes,
      ).toContain('Advertencias aceptadas: JUROR_OVER_LIMIT.');
    });
  });

  it('un bloqueo de HU-08 frena toda la operación (400 con su code) aunque se confirme', async () => {
    validate.mockResolvedValue({
      blockers: [
        {
          code: 'SCHOOL_REQUIRES_SENIOR',
          message:
            'Los jurados JUNIOR no pueden ser asignados a colegios (nivel 0).',
          jurorId: 's1',
          teamId: 3,
        },
      ],
      warnings: [],
    });

    await expect(run({ confirmWarnings: true })).rejects.toMatchObject({
      status: 400,
      response: { code: 'SCHOOL_REQUIRES_SENIOR', teamId: 3 },
    });
    nothingSaved();
  });

  it('si algo falla dentro de la transacción: 500, se revierte (la transacción rechaza) y no hay push ni correo', async () => {
    notices.recordAssignment.mockImplementation(
      (_tx: unknown, { jurorId }: { jurorId: string }) =>
        jurorId === 's2'
          ? Promise.reject(new Error('db caída'))
          : Promise.resolve(101),
    );

    await expect(run()).rejects.toMatchObject({ status: 500 });
    expect(push.notifyTeamsAssigned).not.toHaveBeenCalled();
    expect(notices.sendEmailAfterCommit).not.toHaveBeenCalled();
  });

  it('404 NO_ACTIVE_EDITION sin edición activa', async () => {
    prisma.edition.findFirst.mockResolvedValue(null);

    await expect(run()).rejects.toMatchObject({
      status: 404,
      response: { code: 'NO_ACTIVE_EDITION' },
    });
    nothingSaved();
  });
});
