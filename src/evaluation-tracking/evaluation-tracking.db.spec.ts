import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { EvaluationTrackingService } from './evaluation-tracking.service';

/**
 * Integración (BG-73, ARK-284): el panel de seguimiento cuenta solo evaluaciones de jurado.
 * La nota que el profesor pone a sus NRC se guarda en la misma tabla pero sin detalles por
 * criterio, y no es una evaluación recibida del grupo.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed (edición activa,
 * roles y criterios). Crea sus propios datos y los borra por id al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

const DAY = '2026-11-26';
const at = (time: string) => new Date(`${DAY}T${time}:00.000-05:00`);

maybe('BG-73: seguimiento sin la nota del profesor (BD real)', () => {
  const prisma = new PrismaService();
  const service = new EvaluationTrackingService(prisma);
  const tag = randomUUID().slice(0, 6);
  const created = {
    users: [] as string[],
    teams: [] as number[],
    evaluations: [] as number[],
  };
  let editionId = 0;
  let criterionId = 0;
  let professorId = '';
  const team = {} as Record<string, { teamId: number; videogameId: number }>;
  const jurors: string[] = [];

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const row = await prisma.user.create({
      data: {
        email: `${key}-${tag}@bg73.test`,
        firstName: key,
        lastName: `BG73 ${tag}`,
        roleId: roleRow.id,
      },
      select: { id: true },
    });
    created.users.push(row.id);
    return row.id;
  };

  /** Equipo confirmado de la edición activa con sus jurados asignados. */
  const createTeam = async (key: string, level: string, assigned: string[]) => {
    const status = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const row = await prisma.team.create({
      data: {
        teamName: `Equipo ${key} ${tag}`,
        teamCode: `${level}-${key}${tag}`.slice(0, 12),
        userId: await user(`lider${key}`, 'Estudiante'),
        editionId,
        videogame: {
          create: {
            name: `Juego ${key} ${tag}`.slice(0, 30),
            videogameStatusId: status.id,
          },
        },
        assignedJurors: { connect: assigned.map((id) => ({ id })) },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    created.teams.push(row.id);
    team[key] = { teamId: row.id, videogameId: row.videogame!.id };
  };

  /** Evaluación de jurado (con detalle por criterio) enviada a la hora indicada. */
  const juryEvaluation = async (
    key: string,
    jurorId: string,
    time: string,
    over: { isActive?: boolean } = {},
  ) => {
    const row = await prisma.evaluation.create({
      data: {
        jurorId,
        videogameId: team[key].videogameId,
        editionId,
        date: at(time),
        totalScore: 4,
        isSenior: false,
        isActive: over.isActive ?? true,
        details: { create: { score: 4, criterionId } },
      },
      select: { id: true },
    });
    created.evaluations.push(row.id);
  };

  /** Nota del profesor a sus NRC: solo el total, sin detalles (como `updateTeamEvaluation`). */
  const professorNote = async (key: string, time: string) => {
    const row = await prisma.evaluation.create({
      data: {
        jurorId: professorId,
        videogameId: team[key].videogameId,
        editionId,
        date: at(time),
        totalScore: 5,
        isSenior: true,
      },
      select: { id: true },
    });
    created.evaluations.push(row.id);
  };

  const groupOf = async (key: string) => {
    const { groups } = await service.getTracking({ date: DAY });
    return groups.find((g) => g.teamId === team[key].teamId)!;
  };

  beforeAll(async () => {
    await prisma.$connect();
    editionId = (
      await prisma.edition.findFirstOrThrow({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
        select: { id: true },
      })
    ).id;
    criterionId = (
      await prisma.criterion.findFirstOrThrow({ select: { id: true } })
    ).id;
    professorId = await user('profesor', 'Profesor');
    for (const key of ['j1', 'j2', 'j3']) {
      jurors.push(await user(key, 'Jurado'));
    }

    // A: 3 jurados asignados que evaluaron + la nota del profesor (el caso del ticket).
    await createTeam('A', 'N1', jurors);
    for (const [index, time] of ['08:30', '09:30', '10:30'].entries()) {
      await juryEvaluation('A', jurors[index], time);
    }
    await professorNote('A', '08:45');

    // B: 2 jurados evaluaron + la nota del profesor: antes se veían 3 recibidas.
    await createTeam('B', 'N1', jurors);
    await juryEvaluation('B', jurors[0], '08:30');
    await juryEvaluation('B', jurors[1], '09:30');
    await professorNote('B', '08:40');

    // C: solo la nota del profesor y una evaluación de jurado anulada (inactiva).
    await createTeam('C', 'N1', jurors);
    await professorNote('C', '08:40');
    await juryEvaluation('C', jurors[0], '08:50', { isActive: false });
  });

  afterAll(async () => {
    await prisma.evaluationDetail.deleteMany({
      where: { evaluationId: { in: created.evaluations } },
    });
    await prisma.evaluation.deleteMany({
      where: { id: { in: created.evaluations } },
    });
    await prisma.team.deleteMany({ where: { id: { in: created.teams } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    await prisma.$disconnect();
  });

  it('un grupo con 3 jurados y la nota del profesor: Recibidas 3, Cuentan 3 (no 4)', async () => {
    const group = await groupOf('A');
    expect(group).toMatchObject({
      assignedJurors: 3,
      evaluationsReceived: 3,
      evaluationsCounted: 3,
      belowMinimumAt11: false,
    });
  });

  it('un grupo con 2 jurados y la nota del profesor: Recibidas 2, Cuentan 2', async () => {
    const group = await groupOf('B');
    expect(group).toMatchObject({
      evaluationsReceived: 2,
      evaluationsCounted: 2,
      belowMinimumAt11: true,
    });
  });

  it('la tabla por hora muestra los mismos números, sin la nota del profesor', async () => {
    // Cortes acumulados hasta cada hora en punto. A: jurados a las 08:30, 09:30 y 10:30; la nota
    // del profesor (08:45) no suma (con ella se verían 0, 2, 3, 4, 4).
    expect((await groupOf('A')).byHour).toEqual([
      { hour: 8, received: 0, counted: 0 },
      { hour: 9, received: 1, counted: 1 },
      { hour: 10, received: 2, counted: 2 },
      { hour: 11, received: 3, counted: 3 },
      { hour: 12, received: 3, counted: 3 },
    ]);
    // B: jurados a las 08:30 y 09:30; la nota del profesor (08:40) no suma (con ella: 0, 2, 3, 3, 3).
    expect((await groupOf('B')).byHour.map((b) => b.received)).toEqual([
      0, 1, 2, 2, 2,
    ]);
  });

  it('un grupo con solo la nota del profesor (y una evaluación anulada) queda en 0', async () => {
    const group = await groupOf('C');
    expect(group).toMatchObject({
      evaluationsReceived: 0,
      evaluationsCounted: 0,
      belowMinimumAt11: true,
    });
    expect(group.byHour.every((b) => b.received === 0)).toBe(true);
  });

  it('los grupos que más evaluaciones necesitan salen primero, con la misma cifra', async () => {
    const { groups } = await service.getTracking({ date: DAY });
    const mine = groups
      .filter((g) => created.teams.includes(g.teamId))
      .map((g) => [g.teamId, g.evaluationsCounted]);
    expect(mine).toEqual([
      [team.C.teamId, 0],
      [team.B.teamId, 2],
      [team.A.teamId, 3],
    ]);
  });
});
