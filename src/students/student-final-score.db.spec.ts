import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TeamsService } from '../teams/services/teams.service';
import { blobRefsPassthrough } from '../upload/blob-reference.mock';
import { ROLE_IDS } from '../auth/constants/roles';
import { StudentsService } from './students.service';

/**
 * Integración (ARK-154 / HU-30) contra Postgres real y la vista `vw_team_final_scores`: un
 * estudiante de un equipo con varias evaluaciones recibe solo la nota final de su grupo (la del
 * ranking, 2 decimales), sin el promedio de los jurados ni la nota del profesor. El profesor sigue
 * recibiendo el desglose. «Mis jurados» dice quién evaluó, sin la nota.
 *
 * Datos: ponderación 60 % jurados / 40 % profesor; 4 evaluaciones de jurados (4, 3, 5 y luego 1:
 * solo cuentan las 3 primeras → 4.00) y la nota del profesor 3.5 → nota final 3.80.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Nota final del estudiante sin desglose (BD real)', () => {
  const prisma = new PrismaService();
  const teams = new TeamsService(
    {} as any,
    {} as any,
    {} as any,
    prisma,
    new SettingsService(prisma),
    blobRefsPassthrough(),
    { orderRows: async (rows: any[]) => rows } as any,
  );
  const students = new StudentsService(prisma);

  const tag = randomUUID().slice(0, 6);
  const ids = {
    edition: 0,
    wasActive: [] as number[],
    users: [] as string[],
    team: 0,
    videogame: 0,
    leader: '',
    professor: '',
    jurors: [] as string[],
  };

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu30.test`,
        firstName: key,
        lastName: `HU30 ${tag}`,
        roleId: roleRow.id,
        isActive: true,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    return created.id;
  };

  const evaluate = (
    jurorId: string,
    score: number,
    minute: number,
    isSenior: boolean,
  ) =>
    prisma.evaluation.create({
      data: {
        jurorId,
        videogameId: ids.videogame,
        editionId: ids.edition,
        totalScore: score,
        isSenior,
        date: new Date(Date.UTC(2099, 0, 1, 10, minute)),
      },
    });

  beforeAll(async () => {
    await prisma.$connect();
    ids.edition = (
      await prisma.edition.create({
        data: {
          year: 2099,
          semester: 30,
          title: `HU-30 ${tag}`,
          startsAt: new Date('2099-01-01T00:00:00Z'),
          endsAt: new Date('2099-01-02T00:00:00Z'),
          status: EditionStatus.INACTIVE,
        },
        select: { id: true },
      })
    ).id;
    await prisma.weighting.create({
      data: { editionId: ids.edition, juniorPct: 60, seniorPct: 40 },
    });

    ids.leader = await user('lider', 'Estudiante');
    ids.professor = await user('profe', 'Profesor');
    for (const k of ['j1', 'j2', 'j3', 'j4'])
      ids.jurors.push(await user(k, 'Jurado'));

    const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const team = await prisma.team.create({
      data: {
        teamName: `Equipo HU30 ${tag}`,
        teamCode: `N1-${tag}`,
        userId: ids.leader,
        editionId: ids.edition,
        // j4 no está asignado: su evaluación llega tarde y no cuenta
        assignedJurors: {
          connect: [ids.professor, ...ids.jurors.slice(0, 3)].map((id) => ({
            id,
          })),
        },
        videogame: {
          create: {
            name: `Juego HU30 ${tag}`,
            videogameStatusId: confirmed.id,
          },
        },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    ids.team = team.id;
    ids.videogame = team.videogame!.id;

    await evaluate(ids.jurors[0], 4, 1, false);
    await evaluate(ids.jurors[1], 3, 2, false);
    await evaluate(ids.jurors[2], 5, 3, false);
    await evaluate(ids.jurors[3], 1, 4, false); // la cuarta no cuenta (HU-04)
    await evaluate(ids.professor, 3.5, 5, true);

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
      where: { id: ids.edition },
      data: { status: EditionStatus.ACTIVE },
    });
    // Ranking publicado: la ruta pública de la nota final responde
    await prisma.eventConfiguration.create({
      data: {
        editionId: ids.edition,
        showRanking: true,
        showEvaluations: true,
      },
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
      await prisma.eventConfiguration.deleteMany({
        where: { editionId: ids.edition },
      });
      await prisma.evaluation.deleteMany({
        where: { videogameId: ids.videogame },
      });
      await prisma.team.deleteMany({ where: { id: ids.team } });
      await prisma.weighting.deleteMany({ where: { editionId: ids.edition } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({ where: { id: ids.edition } });
    } finally {
      await prisma.$disconnect();
    }
  });

  const student = () => ({ id: ids.leader, roleId: ROLE_IDS.STUDENT }) as any;

  it('el estudiante recibe solo la nota final (la del ranking, 2 decimales)', async () => {
    const rows = await teams.getFinalScoreByTeam(ids.team, student());
    expect(rows).toHaveLength(1);
    expect(rows![0].finalScore).toBe(3.8);
    expect(rows![0]).not.toHaveProperty('avgJunior');
    expect(rows![0]).not.toHaveProperty('avgSenior');
  });

  it('sin sesión tampoco llega el desglose', async () => {
    const rows = await teams.getFinalScoreByTeam(ids.team, undefined);
    expect(rows![0]).not.toHaveProperty('avgJunior');
    expect(rows![0]).not.toHaveProperty('avgSenior');
  });

  it('el profesor sigue viendo el desglose', async () => {
    const rows = await teams.getFinalScoreByTeam(ids.team, {
      id: ids.professor,
      roleId: ROLE_IDS.PROFESSOR,
    } as any);
    expect(rows![0]).toMatchObject({
      finalScore: 3.8,
      avgJunior: 4,
      avgSenior: 3.5,
    });
  });

  it('Mis jurados: quién evaluó, sin la nota', async () => {
    const judges = await students.getMyJudges(ids.leader);
    expect(judges).toHaveLength(4);
    expect(judges.every((j) => j.haEvaluado)).toBe(true);
    for (const judge of judges) expect(judge).not.toHaveProperty('totalScore');
    expect(judges.find((j) => j.id === ids.professor)?.categoria).toBe(
      'PROFESOR',
    );
  });
});
