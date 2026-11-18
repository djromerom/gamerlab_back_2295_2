import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GradingGamesService } from './grading-games.service';
import { ProfessorPanelQueryService } from './professor-panel-query.service';
import { ProfessorsService } from './professors.service';

/**
 * Integración (ARK-160 / BG-37) contra Postgres real y la vista `vw_team_final_scores`: qué ve el
 * profesor en su panel después de guardar notas de varios equipos de un mismo NRC.
 *
 * La nota del profesor siempre se guarda. La nota de la feria queda en null («Pendiente») mientras
 * falte una de las dos partes (HU-34). La casilla «Externo» no cambia ni la nota ni la regla
 * (BG-69, ARK-272).
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Nota de la feria tras guardar la del profesor (BD real)', () => {
  const prisma = new PrismaService();
  const professors = new ProfessorsService({} as any, prisma, {} as any);
  const panel = new GradingGamesService(
    prisma,
    new ProfessorPanelQueryService(prisma),
  );

  const tag = randomUUID().slice(0, 6);
  const ids = {
    edition: 0,
    wasActive: [] as number[],
    users: [] as string[],
    subject: 0,
    nrc: 0,
    teams: [] as number[],
    professor: '',
    juror: '',
  };
  const games: Record<string, number> = {};

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@bg37.test`,
        firstName: key,
        lastName: `BG37 ${tag}`,
        roleId: roleRow.id,
        isActive: true,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    return created.id;
  };

  const team = async (key: string, code: string, isExternal: boolean) => {
    const status = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const created = await prisma.team.create({
      data: {
        teamName: `${key} ${tag}`,
        teamCode: `${code}-${tag}`,
        isExternal,
        userId: await user(`lider-${key}`, 'Estudiante'),
        editionId: ids.edition,
        videogame: {
          create: { name: `${key} ${tag}`, videogameStatusId: status.id },
        },
        members: {
          create: {
            firstName: key,
            lastName: 'BG37',
            email: `${key}-${tag}@miembro.test`,
            studentCode: `${key}-${tag}`,
            editionId: ids.edition,
            nrcs: { connect: { id: ids.nrc } },
          },
        },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    ids.teams.push(created.id);
    games[key] = created.videogame!.id;
    return created.videogame!.id;
  };

  const evaluate = (
    jurorId: string,
    videogameId: number,
    score: number,
    isSenior: boolean,
    isActive = true,
  ) =>
    prisma.evaluation.create({
      data: {
        jurorId,
        videogameId,
        editionId: ids.edition,
        totalScore: score,
        isSenior,
        isActive,
      },
    });

  const rowOf = async (key: string) => {
    const { data } = await panel.list(ids.professor, {
      page: 1,
      limit: 50,
      nrcId: ids.nrc,
      sortBy: 'team',
      sortOrder: 'asc',
    } as any);
    return data.find((r) => r.videogameId === games[key])!;
  };

  beforeAll(async () => {
    await prisma.$connect();
    const active = await prisma.edition.findMany({
      where: { status: EditionStatus.ACTIVE },
      select: { id: true },
    });
    ids.wasActive = active.map((e) => e.id);
    await prisma.edition.updateMany({
      where: { id: { in: ids.wasActive } },
      data: { status: EditionStatus.INACTIVE },
    });
    ids.edition = (
      await prisma.edition.create({
        data: {
          year: 2097,
          semester: 30,
          title: `BG-37 ${tag}`,
          startsAt: new Date('2097-01-01T00:00:00Z'),
          endsAt: new Date('2097-01-02T00:00:00Z'),
          status: EditionStatus.ACTIVE,
        },
        select: { id: true },
      })
    ).id;
    await prisma.eventConfiguration.create({
      data: { editionId: ids.edition, evaluationsOpen: true },
    });
    await prisma.weighting.create({
      data: { editionId: ids.edition, juniorPct: 60, seniorPct: 40 },
    });

    ids.professor = await user('profe', 'Profesor');
    ids.juror = await user('jurado', 'Jurado');
    ids.subject = (
      await prisma.subject.create({
        data: { name: `BG37 ${tag}`, code: `BG37${tag}`, semester: 1 },
        select: { id: true },
      })
    ).id;
    ids.nrc = (
      await prisma.nRC.create({
        data: {
          code: 97000 + Math.floor(Math.random() * 1000),
          subjectId: ids.subject,
          professorId: ids.professor,
          editionId: ids.edition,
        },
        select: { id: true },
      })
    ).id;

    await team('regular', 'N1-A', false);
    await evaluate(ids.juror, await team('conjurado', 'N1-B', false), 4, false);
    await team('externo', 'N1-C', true);
    await evaluate(
      ids.juror,
      await team('externoconjurado', 'N1-D', true),
      4,
      false,
    );
    await team('colegioexterno', 'N0-E', true);
    await evaluate(
      ids.professor,
      await team('inactiva', 'N1-F', false),
      2,
      true,
      false,
    );
  });

  afterAll(async () => {
    // Limpieza de los datos de esta prueba: la base es compartida con otras integraciones.
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
        where: { editionId: ids.edition },
      });
      await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
      await prisma.nRC.deleteMany({ where: { id: ids.nrc } });
      await prisma.subject.deleteMany({ where: { id: ids.subject } });
      await prisma.weighting.deleteMany({ where: { editionId: ids.edition } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({ where: { id: ids.edition } });
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('después de «Guardar todo» con todos los equipos del NRC', () => {
    let juniorBefore: number | null | undefined;

    beforeAll(async () => {
      juniorBefore = (
        await prisma.teamFinalScore.findFirst({
          where: { videogameId: games.conjurado },
        })
      )?.avgJunior;
      const { results } = await professors.updateTeamEvaluationBatch(
        ids.professor,
        Object.values(games).map((videogameId) => ({
          videogameId,
          score: 3.5,
        })),
      );
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('equipo normal sin jurados: la feria sigue en proceso (HU-34)', async () => {
      expect(await rowOf('regular')).toMatchObject({
        calificacionFeria: null,
        calificacionDocente: 3.5,
        isExternal: false,
      });
    });

    it('equipo normal con jurado: pondera y no toca la evaluación del jurado', async () => {
      expect(await rowOf('conjurado')).toMatchObject({
        calificacionFeria: 3.8,
        calificacionDocente: 3.5,
      });
      const score = await prisma.teamFinalScore.findFirst({
        where: { videogameId: games.conjurado },
      });
      expect(score?.avgJunior).toBe(juniorBefore);
      expect(score?.juniorEvaluations).toBe(1);
    });

    it('equipo con la casilla Externo y sin jurados: la nota se guarda, la feria sigue pendiente y la regla es la estándar', async () => {
      expect(await rowOf('externo')).toMatchObject({
        calificacionFeria: null,
        calificacionDocente: 3.5,
        isExternal: true,
        fairGradeRule: 'STANDARD',
      });
    });

    it('equipo con la casilla Externo y con jurado: la feria es 60/40 como la de cualquier equipo', async () => {
      expect(await rowOf('externoconjurado')).toMatchObject({
        calificacionFeria: 3.8, // ponderación de la prueba: 60 % de 4 (jurado) + 40 % de 3.5 (profesor)
        calificacionDocente: 3.5,
        isExternal: true,
        fairGradeRule: 'STANDARD',
      });
    });

    it('colegio (N0) externo: su nota es la de profesores y seniors (HU-34)', async () => {
      expect(await rowOf('colegioexterno')).toMatchObject({
        calificacionFeria: 3.5,
        calificacionDocente: 3.5,
        isExternal: true,
        fairGradeRule: 'SCHOOL',
      });
    });

    it('evaluación propia inactiva: guardar la reactiva y vuelve a contar como nota del profesor', async () => {
      expect(await rowOf('inactiva')).toMatchObject({
        calificacionFeria: null,
        calificacionDocente: 3.5,
      });
    });
  });

  it('el guardado individual se comporta igual que el lote', async () => {
    await professors.updateTeamEvaluation(
      games.externo,
      ids.professor,
      2.75,
      true,
    );
    expect(await rowOf('externo')).toMatchObject({
      calificacionFeria: null,
      calificacionDocente: 2.75,
    });
    await professors.updateTeamEvaluation(
      games.regular,
      ids.professor,
      2.75,
      true,
    );
    expect(await rowOf('regular')).toMatchObject({
      calificacionFeria: null,
      calificacionDocente: 2.75,
    });
  });
});
