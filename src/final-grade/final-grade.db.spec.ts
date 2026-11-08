import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StudentsController } from '../students/students.controller';
import { FinalGradeService } from './final-grade.service';

/**
 * HU-20 (ARK-80) contra Postgres real y la vista `vw_team_final_scores`.
 *
 * Feria el 2099-03-10 a las 8:00 (Colombia). Dos equipos:
 * - «completo»: jurados 4, 3 y 5 (y una cuarta de 1 que no cuenta) y profesor 3.5; con la
 *   ponderación de la edición (60 % jurados / 40 % profesor) la nota del ranking es 3.80.
 * - «sin profesor»: solo dos jurados (4 y 5): queda «Nota en proceso» y con menos de 3.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Nota final para los estudiantes (BD real)', () => {
  const prisma = new PrismaService();
  const service = new FinalGradeService(prisma);
  const students = new StudentsController({} as any, {} as any, service);

  const tag = randomUUID().slice(0, 6);
  const BEFORE_NOON = new Date('2099-03-10T16:30:00Z'); // 11:30 en Colombia
  const AFTER_NOON = new Date('2099-03-10T17:10:00Z'); // 12:10
  const ids = {
    edition: 0,
    wasActive: [] as number[],
    users: [] as string[],
    teams: [] as number[],
    videogames: [] as number[],
  };
  let completeLeader = '';
  let pendingLeader = '';

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu20.test`,
        firstName: key,
        lastName: `HU20 ${tag}`,
        roleId: roleRow.id,
        isActive: true,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    return created.id;
  };

  const createTeam = async (code: string, leader: string) => {
    const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const team = await prisma.team.create({
      data: {
        teamName: `Equipo ${code} ${tag}`,
        teamCode: `${code}-${tag.slice(0, 4)}`, // máx. 12 caracteres
        userId: leader,
        editionId: ids.edition,
        videogame: {
          create: {
            name: `Juego ${tag}${code.slice(-1)}`,
            videogameStatusId: confirmed.id,
          },
        },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    ids.teams.push(team.id);
    ids.videogames.push(team.videogame!.id);
    return team.videogame!.id;
  };

  const evaluate = (
    videogameId: number,
    jurorId: string,
    score: number,
    minute: number,
    isSenior = false,
  ) =>
    prisma.evaluation.create({
      data: {
        jurorId,
        videogameId,
        editionId: ids.edition,
        totalScore: score,
        isSenior,
        date: new Date(Date.UTC(2099, 2, 10, 14, minute)),
      },
    });

  beforeAll(async () => {
    await prisma.$connect();
    ids.edition = (
      await prisma.edition.create({
        data: {
          year: 2099,
          semester: 20,
          title: `HU-20 ${tag}`,
          startsAt: new Date('2099-03-10T13:00:00Z'),
          endsAt: new Date('2099-03-10T17:30:00Z'),
          status: EditionStatus.INACTIVE,
        },
        select: { id: true },
      })
    ).id;
    await prisma.weighting.create({
      data: { editionId: ids.edition, juniorPct: 60, seniorPct: 40 },
    });

    completeLeader = await user('lider1', 'Estudiante');
    pendingLeader = await user('lider2', 'Estudiante');
    const professor = await user('profe', 'Profesor');
    const jurors: string[] = [];
    for (const k of ['j1', 'j2', 'j3', 'j4'])
      jurors.push(await user(k, 'Jurado'));

    const complete = await createTeam('N1-AAA', completeLeader);
    const pending = await createTeam('N1-BBB', pendingLeader);
    await evaluate(complete, jurors[0], 4, 1);
    await evaluate(complete, jurors[1], 3, 2);
    await evaluate(complete, jurors[2], 5, 3);
    await evaluate(complete, jurors[3], 1, 4); // la cuarta no cuenta (HU-04)
    await evaluate(complete, professor, 3.5, 5, true);
    await evaluate(pending, jurors[0], 4, 6);
    await evaluate(pending, jurors[1], 5, 7);

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
    await prisma.eventConfiguration.create({
      data: { editionId: ids.edition },
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
      await prisma.fairSchedule.deleteMany({
        where: { editionId: ids.edition },
      });
      await prisma.eventConfiguration.deleteMany({
        where: { editionId: ids.edition },
      });
      await prisma.evaluation.deleteMany({
        where: { videogameId: { in: ids.videogames } },
      });
      await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
      await prisma.weighting.deleteMany({ where: { editionId: ids.edition } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({ where: { id: ids.edition } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('el administrador ve los equipos incompletos antes de liberar', async () => {
    const status = await service.getReleaseStatus(BEFORE_NOON);
    expect(status).toMatchObject({
      editionId: ids.edition,
      showFinalGrade: false,
      releaseAllowedFrom: '2099-03-10T17:00:00.000Z',
      canReleaseNow: false,
      summary: {
        totalTeams: 2,
        withFinalGrade: 1,
        inProcess: 1,
        lessThanMinEvaluations: 1,
      },
    });
    expect(status.incompleteTeams).toEqual([
      expect.objectContaining({
        teamId: ids.teams[1],
        inProcess: true,
        juniorEvaluations: 2,
        seniorEvaluations: 0,
        reasons: ['MISSING_PROFESSOR_SCORE', 'LESS_THAN_MIN_EVALUATIONS'],
      }),
    ]);
  });

  it('sin liberar, el estudiante no ve ninguna nota (tampoco por GET /students/grades)', async () => {
    await expect(
      service.getStudentFinalGrade(completeLeader),
    ).resolves.toMatchObject({
      released: false,
      status: 'NOT_RELEASED',
      finalGrade: null,
    });
    await expect(students.findGrades(completeLeader)).resolves.toEqual({
      grade: null,
    });
  });

  it('antes de las 12:00 no se puede liberar y no cambia nada', async () => {
    await expect(service.setRelease(true, BEFORE_NOON)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FINAL_GRADE_RELEASE_TOO_EARLY',
      }),
    });
    const cfg = await prisma.eventConfiguration.findUniqueOrThrow({
      where: { editionId: ids.edition },
    });
    expect(cfg.showFinalGrade).toBe(false);
  });

  it('desde las 12:00 se libera: el estudiante ve solo la nota del ranking', async () => {
    const status = await service.setRelease(true, AFTER_NOON);
    expect(status).toMatchObject({
      showFinalGrade: true,
      releasedAt: AFTER_NOON.toISOString(),
    });

    const grade = await service.getStudentFinalGrade(completeLeader);
    expect(grade).toEqual({
      editionId: ids.edition,
      team: {
        id: ids.teams[0],
        teamName: expect.any(String),
        teamCode: expect.any(String),
      },
      released: true,
      status: 'AVAILABLE',
      finalGrade: 3.8,
    });
    await expect(students.findGrades(completeLeader)).resolves.toEqual({
      grade: 3.8,
    });
  });

  it('el equipo sin nota del profesor ve «Nota en proceso», no una nota parcial', async () => {
    await expect(
      service.getStudentFinalGrade(pendingLeader),
    ).resolves.toMatchObject({
      released: true,
      status: 'IN_PROCESS',
      finalGrade: null,
    });
    await expect(students.findGrades(pendingLeader)).resolves.toEqual({
      grade: null,
    });
  });

  it('el administrador la vuelve a ocultar', async () => {
    const status = await service.setRelease(false, AFTER_NOON);
    expect(status).toMatchObject({ showFinalGrade: false, releasedAt: null });
    await expect(
      service.getStudentFinalGrade(completeLeader),
    ).resolves.toMatchObject({
      status: 'NOT_RELEASED',
    });
  });

  it('con cronograma (HU-12) manda su hora de cierre: a las 12:10 no deja si cierra a las 12:30', async () => {
    await prisma.fairSchedule.create({
      data: {
        editionId: ids.edition,
        fairDate: new Date('2099-03-10T00:00:00Z'),
        startTime: '08:00',
        alertTime: '10:00',
        controlTime: '11:00',
        closeTime: '12:30',
      },
    });
    const status = await service.getReleaseStatus(AFTER_NOON);
    expect(status).toMatchObject({
      fairDate: '2099-03-10',
      releaseTime: '12:30',
      scheduleConfigured: true,
      releaseAllowedFrom: '2099-03-10T17:30:00.000Z',
      canReleaseNow: false,
    });
    await expect(service.setRelease(true, AFTER_NOON)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FINAL_GRADE_RELEASE_TOO_EARLY',
      }),
    });
  });
});
