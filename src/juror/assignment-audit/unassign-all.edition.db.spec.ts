import { EditionStatus, ManualJurorAssignmentAction } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { JurorAssignmentService } from './juror-assignment.service';
import { JurorAssignmentAuditService } from './juror-assignment-audit.service';

/**
 * Integración (ARK-133 / BG-20) contra Postgres real: con dos ediciones, «quitar todas» y «quitar
 * todas las de un jurado» vacían solo los equipos de la edición activa; los de la anterior quedan
 * con sus jurados. La bitácora anota la edición y la cantidad.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Crea dos
 * ediciones de 2098; durante la prueba la «actual» es la ACTIVE y la(s) activa(s) del seed pasan a
 * INACTIVE, así que «quitar todas» solo toca los equipos creados aquí. Al terminar restaura los
 * estados y borra lo que creó.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Quitar asignaciones solo en la edición activa (BD real)', () => {
  const prisma = new PrismaService();
  const service = new JurorAssignmentService(
    prisma,
    new JurorAssignmentAuditService(prisma),
    {} as any,
    { notifyAssignmentChanged: jest.fn() } as any,
    // HU-22 (ARK-84): avisos a suplentes (no aplican en estas pruebas).
    { recordAssignment: async () => null, sendEmailAfterCommit: () => undefined } as any,
  );

  const tag = randomUUID().slice(0, 6);
  const ids = {
    previous: 0,
    current: 0,
    wasActive: [] as number[],
    users: [] as string[],
    teams: {} as Record<string, number>,
    actor: '',
    jurorA: '',
    jurorB: '',
  };

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2098,
        semester,
        title: `BG-20 ${tag} ${semester}`,
        startsAt: new Date('2098-01-01T00:00:00Z'),
        endsAt: new Date('2098-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({ where: { name: role } });
    const created = await prisma.user.create({
      data: {
        email: `${key.toLowerCase()}-${tag}@bg20.test`,
        firstName: key,
        lastName: tag,
        roleId: roleRow.id,
        isActive: true,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    return created.id;
  };

  const team = async (key: string, editionId: number, jurorIds: string[]) => {
    const leader = await user(`lider${key}`, 'Estudiante');
    const created = await prisma.team.create({
      data: {
        teamName: `Equipo ${key} ${tag}`,
        teamCode: `N1-${key}${tag}`.slice(0, 12),
        userId: leader,
        editionId,
        assignedJurors: { connect: jurorIds.map((id) => ({ id })) },
      },
      select: { id: true },
    });
    ids.teams[key] = created.id;
  };

  const jurorsOf = async (key: string) =>
    (
      await prisma.team.findUniqueOrThrow({
        where: { id: ids.teams[key] },
        select: { assignedJurors: { select: { id: true } } },
      })
    ).assignedJurors
      .map((j) => j.id)
      .sort();

  beforeAll(async () => {
    await prisma.$connect();
    ids.previous = (await edition(10)).id;
    ids.current = (await edition(30)).id;
    ids.actor = await user('admin', 'Administrador');
    ids.jurorA = await user('juradoA', 'Jurado');
    ids.jurorB = await user('juradoB', 'Jurado');

    // Edición anterior: dos equipos con los dos jurados (historial que no se debe tocar)
    await team('P1', ids.previous, [ids.jurorA, ids.jurorB]);
    await team('P2', ids.previous, [ids.jurorA]);
    // Edición actual
    await team('C1', ids.current, [ids.jurorA, ids.jurorB]);
    await team('C2', ids.current, [ids.jurorA]);

    const active = await prisma.edition.findMany({
      where: { status: EditionStatus.ACTIVE },
      select: { id: true },
    });
    ids.wasActive = active.map((e) => e.id);
    await prisma.edition.updateMany({
      where: { id: { in: ids.wasActive } },
      data: { status: EditionStatus.INACTIVE },
    });
    await prisma.edition.update({
      where: { id: ids.current },
      data: { status: EditionStatus.ACTIVE },
    });

    await service.onModuleInit();
  });

  afterAll(async () => {
    try {
      await prisma.edition.update({
        where: { id: ids.current },
        data: { status: EditionStatus.INACTIVE },
      });
      await prisma.edition.updateMany({
        where: { id: { in: ids.wasActive } },
        data: { status: EditionStatus.ACTIVE },
      });
      await prisma.jurorAssignmentAuditLog.deleteMany({
        where: { actorUserId: ids.actor },
      });
      await prisma.team.deleteMany({ where: { id: { in: Object.values(ids.teams) } } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({
        where: { id: { in: [ids.previous, ids.current] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('quitar todas las de un jurado: solo en la edición activa', async () => {
    const result = await service.unassignAllFromEvaluator(ids.jurorB, ids.actor);

    expect(result.asignacionesEliminadas).toBe(1);
    expect(result.edicion).toEqual({ id: ids.current, title: `BG-20 ${tag} 30` });
    expect(await jurorsOf('C1')).toEqual([ids.jurorA]);
    // La edición anterior conserva al jurado B
    expect(await jurorsOf('P1')).toEqual([ids.jurorA, ids.jurorB].sort());

    const log = await prisma.jurorAssignmentAuditLog.findFirstOrThrow({
      where: {
        actorUserId: ids.actor,
        action: ManualJurorAssignmentAction.UNASSIGN_ALL_FROM_EVALUATOR,
      },
    });
    expect(log.notes).toContain(`(id ${ids.current})`);
    expect(log.notes).toContain('se eliminó 1 asignación');
  });

  it('quitar todas: vacía la edición activa y deja intacta la anterior', async () => {
    const result = await service.unassignAll(ids.actor);

    expect(result.asignacionesEliminadas).toBe(2);
    expect(result.equiposAfectados).toBe(2);
    expect(await jurorsOf('C1')).toEqual([]);
    expect(await jurorsOf('C2')).toEqual([]);
    expect(await jurorsOf('P1')).toEqual([ids.jurorA, ids.jurorB].sort());
    expect(await jurorsOf('P2')).toEqual([ids.jurorA]);

    const log = await prisma.jurorAssignmentAuditLog.findFirstOrThrow({
      where: { actorUserId: ids.actor, action: ManualJurorAssignmentAction.UNASSIGN_ALL },
    });
    expect(log.notes).toBe(
      `Edición «BG-20 ${tag} 30» (id ${ids.current}): se eliminaron manualmente 2 asignaciones de evaluadores en 2 equipos.`,
    );
  });

  it('sin asignaciones en la activa responde 400 y no toca la anterior', async () => {
    await expect(service.unassignAll(ids.actor)).rejects.toMatchObject({ status: 400 });
    expect(await jurorsOf('P1')).toEqual([ids.jurorA, ids.jurorB].sort());
  });
});
