import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from '../ranking/ranking.service';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';

/**
 * BG-43 (ARK-205) contra Postgres real: un equipo evaluado que se rechaza pierde su nota y su
 * lugar en el ranking, sus evaluaciones se conservan y, al volver a confirmarlo, todo reaparece.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Equipo rechazado sin nota ni ranking (BD real)', () => {
  const prisma = new PrismaService();
  const ranking = new RankingService(prisma, blobRefsPassthrough());
  const tag = randomUUID().slice(0, 6);
  const users: string[] = [];
  let editionId = 0;
  let confirmedId = 0;
  let rejectedId = 0;
  const teams: { teamId: number; videogameId: number }[] = [];

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@bg43.test`,
        firstName: key,
        lastName: `BG43 ${tag}`,
        roleId: roleRow.id,
      },
      select: { id: true },
    });
    users.push(created.id);
    return created.id;
  };

  const setStatus = (videogameId: number, statusId: number) =>
    prisma.videogame.update({
      where: { id: videogameId },
      data: { videogameStatusId: statusId },
    });

  const viewTeamIds = async () =>
    (
      await prisma.teamFinalScore.findMany({
        where: { editionId },
        orderBy: { teamId: 'asc' },
      })
    ).map((r) => r.teamId);

  const rankedTeamIds = async () =>
    (await ranking.getRanking({ editionId })).levels.flatMap((l) =>
      l.teams.map((t) => t.teamId),
    );

  beforeAll(async () => {
    await prisma.$connect();
    confirmedId = (
      await prisma.videogameStatus.findUniqueOrThrow({
        where: { status: 'CONFIRMADO' },
      })
    ).id;
    rejectedId = (
      await prisma.videogameStatus.findUniqueOrThrow({
        where: { status: 'RECHAZADO' },
      })
    ).id;
    editionId = (
      await prisma.edition.create({
        data: {
          year: 2096,
          semester: 900 + Math.floor(Math.random() * 90),
          title: `BG-43 ${tag}`,
          startsAt: new Date('2096-01-01T00:00:00Z'),
          endsAt: new Date('2096-01-02T00:00:00Z'),
          status: EditionStatus.INACTIVE,
        },
        select: { id: true },
      })
    ).id;
    const juror = await user('jurado', 'Jurado');
    const professor = await user('profesor', 'Profesor');
    for (const [n, junior, senior] of [
      [1, 3, 5],
      [2, 4, 4],
    ] as const) {
      const created = await prisma.team.create({
        data: {
          teamName: `E${n} ${tag}`,
          teamCode: `N1-${tag}${n}`,
          userId: await user(`lider${n}`, 'Estudiante'),
          editionId,
          videogame: {
            create: { name: `J${n} ${tag}`, videogameStatusId: confirmedId },
          },
        },
        select: { id: true, videogame: { select: { id: true } } },
      });
      const videogameId = created.videogame!.id;
      teams.push({ teamId: created.id, videogameId });
      for (const [jurorId, isSenior, totalScore] of [
        [juror, false, junior],
        [professor, true, senior],
      ] as const) {
        await prisma.evaluation.create({
          data: { jurorId, videogameId, editionId, totalScore, isSenior },
        });
      }
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

  it('confirmados, los dos tienen nota y salen en el ranking', async () => {
    expect(await viewTeamIds()).toEqual(teams.map((t) => t.teamId));
    expect((await rankedTeamIds()).sort()).toEqual(
      teams.map((t) => t.teamId).sort(),
    );
  });

  it('rechazado, pierde la nota y el ranking; sus evaluaciones se conservan', async () => {
    const [evaluated, other] = teams;
    await setStatus(evaluated.videogameId, rejectedId);

    expect(await viewTeamIds()).toEqual([other.teamId]);
    expect(await rankedTeamIds()).toEqual([other.teamId]);
    expect(
      await prisma.evaluation.count({
        where: { videogameId: evaluated.videogameId, isActive: true },
      }),
    ).toBe(2);
  });

  it('al volver a confirmarlo, nota y ranking reaparecen con la misma nota', async () => {
    const [evaluated] = teams;
    await setStatus(evaluated.videogameId, confirmedId);

    const row = await prisma.teamFinalScore.findFirstOrThrow({
      where: { teamId: evaluated.teamId },
    });
    expect(row.finalScore).toBe(4.2); // 60 % de 5 + 40 % de 3
    expect(await rankedTeamIds()).toContain(evaluated.teamId);
  });
});
