import { Logger } from '@nestjs/common';
import {
  EditionStatus,
  JurorCategory,
  JurorEditionStatus,
  JurorType,
  ManualJurorAssignmentAction,
} from '@prisma/client';
import { randomUUID } from 'crypto';

import { PrismaService } from 'src/prisma/prisma.service';
import { SubstituteNoticesService } from 'src/jurors/substitute-notices/substitute-notices.service';
import { JurorAssignmentAuditService } from '../assignment-audit/juror-assignment-audit.service';
import { AssignmentValidationService } from '../assignment-validation/assignment-validation.service';
import {
  NOT_A_SUBSTITUTE,
  SUBSTITUTE_BULK_AUDIT_NOTE,
  SubstituteAssignmentService,
} from './substitute-assignment.service';

/**
 * Integración (HU-09, ARK-215) contra Postgres real: suplentes en lote con las reglas reales de
 * HU-08, la bitácora y el aviso de HU-22. Comprueba que solo suma (los jurados originales y sus
 * evaluaciones se conservan, un grupo queda con más de 3 jurados), que omite los pares que ya
 * existen y que una falla a mitad de la transacción no deja ningún cambio.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Crea una edición
 * de 2098 y la deja ACTIVE durante la prueba (las activas del seed pasan a INACTIVE); al terminar
 * restaura los estados y borra lo que creó.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('HU-09: suplentes en lote (BD real)', () => {
  const prisma = new PrismaService();
  const audit = new JurorAssignmentAuditService(prisma);
  const validation = new AssignmentValidationService(prisma);
  const push = {
    notifyAssignmentChanged: jest.fn(),
    notifyTeamsAssigned: jest.fn(),
  };
  const notices = new SubstituteNoticesService(
    prisma,
    { sendEmail: jest.fn(), isConfigured: () => false } as any,
    { get: (_key: string, fallback: unknown) => fallback } as any,
  );
  const service = new SubstituteAssignmentService(
    prisma,
    audit,
    validation,
    push as any,
    notices,
  );

  const tag = randomUUID().slice(0, 5);
  const ids = {
    edition: 0,
    wasActive: [] as number[],
    users: [] as string[],
    teams: [] as number[],
  };
  const user: Record<string, string> = {};
  const team: Record<string, number> = {};
  const game: Record<string, number> = {};

  const createUser = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key.toLowerCase()}-${tag}@hu09.test`,
        firstName: key,
        lastName: `HU09 ${tag}`,
        roleId: roleRow.id,
        jurorCategory: role === 'Jurado' ? JurorCategory.JUNIOR : null,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    user[key] = created.id;
  };

  const createTeam = async (key: string, level: number, jurors: string[]) => {
    await createUser(`lider${key}`, 'Estudiante');
    const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const created = await prisma.team.create({
      data: {
        teamName: `hu09-${tag}-${key}`,
        teamCode: `N${level}-${key}${tag}`.slice(0, 12),
        userId: user[`lider${key}`],
        editionId: ids.edition,
        assignedJurors: { connect: jurors.map((k) => ({ id: user[k] })) },
        videogame: {
          create: {
            name: `hu09-${key}-${tag}`,
            videogameStatusId: confirmed.id,
          },
        },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    ids.teams.push(created.id);
    team[key] = created.id;
    game[key] = created.videogame!.id;
  };

  const jurorsOf = async (key: string) =>
    (
      await prisma.team.findUniqueOrThrow({
        where: { id: team[key] },
        select: { assignedJurors: { select: { id: true } } },
      })
    ).assignedJurors
      .map((j) => j.id)
      .sort();

  const expected = (...keys: string[]) => keys.map((k) => user[k]).sort();

  const auditRows = () =>
    prisma.jurorAssignmentAuditLog.findMany({
      where: { actorUserId: user.admin },
      orderBy: { id: 'asc' },
    });

  const noticesOf = (key: string) =>
    prisma.substituteNotice.findMany({
      where: { jurorId: user[key], editionId: ids.edition },
      select: {
        teams: { select: { teamId: true }, orderBy: { teamId: 'asc' } },
      },
      orderBy: { id: 'asc' },
    });

  const snapshot = async () => ({
    T1: await jurorsOf('T1'),
    T2: await jurorsOf('T2'),
    T3: await jurorsOf('T3'),
    T5: await jurorsOf('T5'),
    audit: (await auditRows()).length,
    notices: await prisma.substituteNotice.count({
      where: { jurorId: { in: ids.users } },
    }),
  });

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await prisma.$connect();

    ids.edition = (
      await prisma.edition.create({
        data: {
          year: 2098,
          semester: 20,
          title: `HU-09 ${tag}`,
          startsAt: new Date('2098-01-01T00:00:00Z'),
          endsAt: new Date('2098-01-02T00:00:00Z'),
          status: EditionStatus.INACTIVE,
        },
        select: { id: true },
      })
    ).id;
    ids.wasActive = (
      await prisma.edition.findMany({
        where: { status: EditionStatus.ACTIVE },
        select: { id: true },
      })
    ).map((e) => e.id);
    await prisma.edition.updateMany({
      where: { id: { in: ids.wasActive } },
      data: { status: EditionStatus.INACTIVE },
    });
    await prisma.edition.update({
      where: { id: ids.edition },
      data: { status: EditionStatus.ACTIVE },
    });

    await createUser('admin', 'Administrador');
    for (const key of [
      'juradoA',
      'juradoB',
      'juradoC',
      'oficial',
      'sup1',
      'sup2',
    ]) {
      await createUser(key, 'Jurado');
    }
    await prisma.jurorEdition.createMany({
      data: [
        ['juradoA', JurorType.OFFICIAL],
        ['juradoB', JurorType.OFFICIAL],
        ['juradoC', JurorType.OFFICIAL],
        ['oficial', JurorType.OFFICIAL],
        ['sup1', JurorType.BACKUP],
        ['sup2', JurorType.BACKUP],
      ].map(([key, type]) => ({
        jurorId: user[key],
        editionId: ids.edition,
        type: type as JurorType,
        status: JurorEditionStatus.CONFIRMED,
      })),
    });

    // T2 lo comparten A y B; sup1 ya está en T3. T5 (otro nivel) es solo de C.
    await createTeam('T1', 1, ['juradoA', 'juradoC']);
    await createTeam('T2', 1, ['juradoA', 'juradoB']);
    await createTeam('T3', 1, ['juradoB', 'sup1']);
    await createTeam('T5', 2, ['juradoC']);

    // Evaluaciones ya hechas por los jurados originales
    await prisma.evaluation.createMany({
      data: [
        {
          jurorId: user.juradoA,
          videogameId: game.T1,
          editionId: ids.edition,
          totalScore: 4.25,
        },
        {
          jurorId: user.juradoB,
          videogameId: game.T2,
          editionId: ids.edition,
          totalScore: 3.5,
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await prisma.edition.update({
        where: { id: ids.edition },
        data: { status: EditionStatus.INACTIVE },
      });
      await prisma.edition.updateMany({
        where: { id: { in: ids.wasActive } },
        data: { status: EditionStatus.ACTIVE },
      });
      await prisma.jurorAssignmentAuditLog.deleteMany({
        where: { actorUserId: user.admin },
      });
      await prisma.substituteNotice.deleteMany({
        where: { jurorId: { in: ids.users } },
      });
      await prisma.evaluation.deleteMany({ where: { editionId: ids.edition } });
      await prisma.videogame.deleteMany({
        where: { teamId: { in: ids.teams } },
      });
      await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
      await prisma.jurorEdition.deleteMany({
        where: { jurorId: { in: ids.users } },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({ where: { id: ids.edition } });
    } finally {
      await prisma.$disconnect();
      jest.restoreAllMocks();
    }
  });

  it('si algo falla a mitad de la transacción no cambia ninguna asignación', async () => {
    const before = await snapshot();
    // El primer aviso se guarda de verdad; el segundo falla cuando ya hay pares y bitácora escritos.
    const real = new SubstituteNoticesService(prisma, {} as any, {} as any);
    const failing = jest
      .spyOn(notices, 'recordAssignment')
      .mockImplementationOnce((tx, input) => real.recordAssignment(tx, input))
      .mockRejectedValueOnce(new Error('falla simulada en el segundo aviso'));

    await expect(
      service.assignToJurorsTeams(
        {
          jurorIds: [user.juradoA, user.juradoB],
          substituteIds: [user.sup1, user.sup2],
        },
        user.admin,
      ),
    ).rejects.toMatchObject({ status: 500 });
    failing.mockRestore();

    expect(await snapshot()).toEqual(before);
    expect(push.notifyTeamsAssigned).not.toHaveBeenCalled();
  });

  it(`un oficial en substituteIds: 400 ${NOT_A_SUBSTITUTE} y nada cambia`, async () => {
    const before = await snapshot();

    await expect(
      service.assignToJurorsTeams(
        { jurorIds: [user.juradoA], substituteIds: [user.sup1, user.oficial] },
        user.admin,
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: NOT_A_SUBSTITUTE, substituteIds: [user.oficial] },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('suma los suplentes a los grupos de A y B sin quitar a nadie y conserva las evaluaciones', async () => {
    const email = jest
      .spyOn(notices, 'sendEmailAfterCommit')
      .mockImplementation();

    const result = await service.assignToJurorsTeams(
      {
        jurorIds: [user.juradoA, user.juradoB],
        substituteIds: [user.sup1, user.sup2],
      },
      user.admin,
    );

    expect(result.totales).toEqual({
      equiposCubiertos: 3,
      asignacionesAgregadas: 5,
      asignacionesOmitidas: 1,
    });
    expect(result.advertenciasAceptadas).toEqual([]);
    // Los originales siguen; T1 y T2 quedan con 4 jurados
    expect(await jurorsOf('T1')).toEqual(
      expected('juradoA', 'juradoC', 'sup1', 'sup2'),
    );
    expect(await jurorsOf('T2')).toEqual(
      expected('juradoA', 'juradoB', 'sup1', 'sup2'),
    );
    expect(await jurorsOf('T3')).toEqual(expected('juradoB', 'sup1', 'sup2'));
    expect(await jurorsOf('T5')).toEqual(expected('juradoC'));

    const evaluations = await prisma.evaluation.findMany({
      where: { editionId: ids.edition },
      select: {
        jurorId: true,
        videogameId: true,
        totalScore: true,
        isActive: true,
      },
      orderBy: { totalScore: 'desc' },
    });
    expect(evaluations).toEqual([
      {
        jurorId: user.juradoA,
        videogameId: game.T1,
        totalScore: 4.25,
        isActive: true,
      },
      {
        jurorId: user.juradoB,
        videogameId: game.T2,
        totalScore: 3.5,
        isActive: true,
      },
    ]);

    const rows = await auditRows();
    expect(rows).toHaveLength(5);
    expect(
      rows.every((r) => r.action === ManualJurorAssignmentAction.ASSIGN),
    ).toBe(true);
    expect(
      rows.every((r) => r.notes?.startsWith(SUBSTITUTE_BULK_AUDIT_NOTE)),
    ).toBe(true);
    const t2sup1 = rows.find(
      (r) => r.teamId === team.T2 && r.jurorId === user.sup1,
    );
    expect(t2sup1?.notes).toContain(`(${user.juradoA})`);
    expect(t2sup1?.notes).toContain(`(${user.juradoB})`);

    // Un aviso por suplente con todos sus grupos nuevos
    expect(
      (await noticesOf('sup1')).map((n) => n.teams.map((t) => t.teamId)),
    ).toEqual([[team.T1, team.T2].sort((a, b) => a - b)]);
    expect(
      (await noticesOf('sup2')).map((n) => n.teams.map((t) => t.teamId)),
    ).toEqual([[team.T1, team.T2, team.T3].sort((a, b) => a - b)]);
    expect(email).toHaveBeenCalledTimes(1);
    expect((email.mock.calls[0][0] as number[]).filter(Boolean)).toHaveLength(
      2,
    );
    // HU-51: un solo aviso con los grupos nuevos de cada suplente.
    expect(push.notifyTeamsAssigned).toHaveBeenCalledTimes(1);
    const pairs = push.notifyTeamsAssigned.mock.calls[0][0] as {
      jurorId: string;
      teamId: number;
    }[];
    const teamsOf = (jurorId: string) =>
      pairs
        .filter((p) => p.jurorId === jurorId)
        .map((p) => p.teamId)
        .sort((a, b) => a - b);
    expect(teamsOf(user.sup1)).toEqual(
      [team.T1, team.T2].sort((a, b) => a - b),
    );
    expect(teamsOf(user.sup2)).toEqual(
      [team.T1, team.T2, team.T3].sort((a, b) => a - b),
    );
    email.mockRestore();
  });

  it('repetir la operación no agrega nada, ni bitácora, ni avisos', async () => {
    const before = await snapshot();

    const result = await service.assignToJurorsTeams(
      {
        jurorIds: [user.juradoA, user.juradoB],
        substituteIds: [user.sup1, user.sup2],
      },
      user.admin,
    );

    expect(result.totales.asignacionesAgregadas).toBe(0);
    expect(result.totales.asignacionesOmitidas).toBe(6);
    expect(await snapshot()).toEqual(before);
  });

  it('con advertencias reales de HU-08 pide confirmación (409) y luego guarda', async () => {
    const email = jest
      .spyOn(notices, 'sendEmailAfterCommit')
      .mockImplementation();
    const before = await snapshot();
    const body = { jurorIds: [user.juradoC], substituteIds: [user.sup1] };

    // sup1 ya tiene T1, T2 y T3 (N1): T5 (N2) lo deja con 4 grupos de dos niveles
    await expect(
      service.assignToJurorsTeams(body, user.admin),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'ASSIGNMENT_WARNINGS' },
    });
    expect(await snapshot()).toEqual(before);

    const result = await service.assignToJurorsTeams(
      { ...body, confirmWarnings: true },
      user.admin,
    );
    expect(result.advertenciasAceptadas.map((w) => w.code).sort()).toEqual([
      'JUROR_MIXED_LEVELS',
      'JUROR_OVER_LIMIT',
    ]);
    expect(result.suplentes[0].equiposAgregados.map((t) => t.id)).toEqual([
      team.T5,
    ]);
    expect(await jurorsOf('T5')).toEqual(expected('juradoC', 'sup1'));
    const last = (await auditRows()).at(-1)!;
    expect(last.notes).toContain('Advertencias aceptadas:');
    expect(await noticesOf('sup1')).toHaveLength(2);
    email.mockRestore();
  });
});
