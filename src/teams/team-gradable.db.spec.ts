import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { NOT_GRADABLE_MESSAGE } from './team-gradable';

/**
 * HU-39 (ARK-209) contra Postgres real: un equipo no calificable no tiene fila en
 * `vw_team_final_scores` (ranking, desempates, notas y reportes salen de ahí) y no se puede
 * calificar. Se prueba con un equipo evaluado y uno sin evaluar, como pide ARK-207.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Equipo no calificable (BD real)', () => {
  const prisma = new PrismaService();
  const tag = randomUUID().slice(0, 6);
  const users: string[] = [];
  let editionId = 0;
  let juror = '';
  let professor = '';
  let evaluated = { teamId: 0, videogameId: 0 };
  let unevaluated = { teamId: 0, videogameId: 0 };

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu39.test`,
        firstName: key,
        lastName: `HU39 ${tag}`,
        roleId: roleRow.id,
      },
      select: { id: true },
    });
    users.push(created.id);
    return created.id;
  };

  const team = async (n: number) => {
    const status = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const created = await prisma.team.create({
      data: {
        teamName: `E${n} ${tag}`,
        teamCode: `N1-${tag}${n}`,
        userId: await user(`lider${n}`, 'Estudiante'),
        editionId,
        assignedJurors: { connect: { id: juror } },
        videogame: {
          create: { name: `J${n} ${tag}`, videogameStatusId: status.id },
        },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    return { teamId: created.id, videogameId: created.videogame!.id };
  };

  const mark = (teamId: number, notGradable: boolean) =>
    prisma.team.update({ where: { id: teamId }, data: { notGradable } });

  const viewRows = () =>
    prisma.teamFinalScore.findMany({
      where: { editionId },
      orderBy: { teamId: 'asc' },
    });

  beforeAll(async () => {
    await prisma.$connect();
    const edition = await prisma.edition.create({
      data: {
        year: 2095,
        semester: 900 + Math.floor(Math.random() * 90),
        title: `HU-39 ${tag}`,
        startsAt: new Date('2095-01-01T00:00:00Z'),
        endsAt: new Date('2095-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });
    editionId = edition.id;
    juror = await user('jurado', 'Jurado');
    professor = await user('profesor', 'Profesor');
    evaluated = await team(1);
    unevaluated = await team(2);
    for (const [jurorId, isSenior, score] of [
      [juror, false, 3],
      [professor, true, 5],
    ] as const) {
      await prisma.evaluation.create({
        data: {
          jurorId,
          videogameId: evaluated.videogameId,
          editionId,
          totalScore: score,
          isSenior,
        },
      });
    }
  });

  afterAll(async () => {
    try {
      await prisma.evaluation.deleteMany({ where: { editionId } });
      await prisma.team.deleteMany({ where: { editionId } });
      await prisma.edition.deleteMany({ where: { id: editionId } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('por defecto los dos equipos son calificables y están en la vista', async () => {
    const rows = await viewRows();
    expect(rows.map((r) => r.teamId)).toEqual([
      evaluated.teamId,
      unevaluated.teamId,
    ]);
    expect(rows[0].finalScore).toBe(4.2); // 60 % de 5 + 40 % de 3
  });

  it('marcados, ninguno sale en la vista y sus evaluaciones se conservan', async () => {
    await mark(evaluated.teamId, true);
    await mark(unevaluated.teamId, true);
    expect(await viewRows()).toEqual([]);
    expect(
      await prisma.evaluation.count({
        where: { videogameId: evaluated.videogameId },
      }),
    ).toBe(2);
  });

  it('marcado, nadie lo puede calificar aunque lo tenga asignado', async () => {
    const service = new EvaluationService(prisma, {} as never, {} as never);
    const { actor, professorRoleId } = await service.loadActor(juror);
    const blockers = await service.findEvaluationBlockers(
      actor,
      [evaluated.videogameId, unevaluated.videogameId],
      editionId,
      professorRoleId,
    );
    expect(blockers.get(evaluated.videogameId)).toBe(NOT_GRADABLE_MESSAGE);
    expect(blockers.get(unevaluated.videogameId)).toBe(NOT_GRADABLE_MESSAGE);
  });

  it('al quitar la marca vuelve con la misma nota', async () => {
    await mark(evaluated.teamId, false);
    const rows = await viewRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      teamId: evaluated.teamId,
      finalScore: 4.2,
    });
  });
});
