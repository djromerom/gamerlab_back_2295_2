import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GradedGamesService } from './gg.service';
import { ProfessorsService } from '../professors/professors.service';

/**
 * Integración (ARK-147 / BG-31) contra Postgres real: en «Equipos Evaluados» del profesor
 * (`GET /graded-games`) solo salen los equipos que evaluó como jurado. La nota que pone a los
 * equipos de sus NRC en «Calificaciones Uninorte» (`updateTeamEvaluation`, misma tabla y sin
 * detalles) no aparece ahí.
 *
 * Dos profesores, A y B, con un NRC cada uno en la edición activa:
 * - A pone la nota a su equipo NRC-A y evalúa como jurado el equipo J1.
 * - B pone la nota a su equipo NRC-B y evalúa como jurado el equipo J2.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Equipos evaluados del profesor: solo como jurado (BD real)', () => {
  const prisma = new PrismaService();
  const blobRefs = { resolveInPlace: () => Promise.resolve() } as any;
  const graded = new GradedGamesService(prisma, blobRefs);
  const professors = new ProfessorsService({} as any, prisma, {} as any);

  const tag = randomUUID().slice(0, 6);
  const ids = {
    edition: 0,
    wasActive: [] as number[],
    subject: 0,
    users: [] as string[],
    teams: [] as number[],
    games: {} as Record<string, number>,
    profA: '',
    profB: '',
    nrc: {} as Record<string, number>,
  };

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({ where: { name: role } });
    const created = await prisma.user.create({
      data: {
        email: `${key.toLowerCase()}-${tag}@bg31.test`,
        firstName: key,
        lastName: `BG31 ${tag}`,
        roleId: roleRow.id,
        isActive: true,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    return created.id;
  };

  /** Equipo con un integrante (en `nrcKey`, si se da) y los evaluadores asignados. */
  const team = async (key: string, assigned: string[], nrcKey?: string) => {
    const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const leader = await user(`lider${key}`, 'Estudiante');
    const created = await prisma.team.create({
      data: {
        teamName: `Equipo ${key} ${tag}`,
        teamCode: `N1-${key}${tag}`.slice(0, 12),
        userId: leader,
        editionId: ids.edition,
        assignedJurors: { connect: assigned.map((id) => ({ id })) },
        videogame: {
          create: { name: `Juego ${key} ${tag}`, videogameStatusId: confirmed.id },
        },
        members: {
          create: {
            firstName: 'Est',
            lastName: key,
            email: `est-${key.toLowerCase()}-${tag}@bg31.test`,
            studentCode: `C${key}${tag}`,
            editionId: ids.edition,
            ...(nrcKey ? { nrcs: { connect: { id: ids.nrc[nrcKey] } } } : {}),
          },
        },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    ids.teams.push(created.id);
    ids.games[key] = created.videogame!.id;
  };

  /** Evaluación de jurado: como la guarda `EvaluationService`, con sus detalles. */
  const evaluateAsJuror = async (jurorId: string, key: string) => {
    const criterion = await prisma.criterion.findFirstOrThrow({
      where: { isActive: true },
    });
    await prisma.evaluation.create({
      data: {
        jurorId,
        videogameId: ids.games[key],
        editionId: ids.edition,
        totalScore: 4.2,
        details: { create: [{ criterionId: criterion.id, score: 4.2 }] },
      },
    });
  };

  beforeAll(async () => {
    await prisma.$connect();
    ids.edition = (
      await prisma.edition.create({
        data: {
          year: 2099,
          semester: 47,
          title: `BG-31 ${tag}`,
          startsAt: new Date('2099-01-01T00:00:00Z'),
          endsAt: new Date('2099-01-02T00:00:00Z'),
          status: EditionStatus.INACTIVE,
        },
        select: { id: true },
      })
    ).id;
    ids.subject = (
      await prisma.subject.create({
        data: { name: `Materia ${tag}`, code: `G${tag}`, semester: 1 },
        select: { id: true },
      })
    ).id;
    ids.profA = await user('profa', 'Profesor');
    ids.profB = await user('profb', 'Profesor');
    const code = 800000 + Math.floor(Math.random() * 90000);
    for (const [key, professorId, offset] of [
      ['A', ids.profA, 0],
      ['B', ids.profB, 1],
    ] as const) {
      ids.nrc[key] = (
        await prisma.nRC.create({
          data: {
            code: code + offset,
            subjectId: ids.subject,
            professorId,
            editionId: ids.edition,
          },
          select: { id: true },
        })
      ).id;
    }

    await team('NA', [], 'A');
    await team('NB', [], 'B');
    await team('J1', [ids.profA]);
    await team('J2', [ids.profB]);

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
      data: { editionId: ids.edition, evaluationsOpen: true },
    });

    // Nota del profesor a su NRC, por la ruta real de «Calificaciones Uninorte»
    await professors.updateTeamEvaluation(ids.games.NA, ids.profA, 3.5);
    await professors.updateTeamEvaluation(ids.games.NB, ids.profB, 4.8);
    // Evaluaciones de jurado
    await evaluateAsJuror(ids.profA, 'J1');
    await evaluateAsJuror(ids.profB, 'J2');
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
        where: { videogameId: { in: Object.values(ids.games) } },
      });
      await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
      await prisma.nRC.deleteMany({ where: { subjectId: ids.subject } });
      await prisma.subject.deleteMany({ where: { id: ids.subject } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({ where: { id: ids.edition } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('la nota del NRC sí quedó guardada en `evaluacion` (sin detalles)', async () => {
    const rows = await prisma.evaluation.findMany({
      where: { videogameId: { in: [ids.games.NA, ids.games.NB] } },
      select: { jurorId: true, _count: { select: { details: true } } },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r._count.details === 0)).toBe(true);
  });

  it('profesor A: Equipos Evaluados solo trae lo que evaluó como jurado', async () => {
    const page = await graded.getGradedVideogames(ids.profA, 50, 1);
    expect(page.data.map((g) => g.videogameName)).toEqual([`Juego J1 ${tag}`]);
    expect(page.metadata.totalItems).toBe(1);
    expect(await graded.getGradedVideogamesCount(ids.profA)).toBe(1);
  });

  it('profesor B: lo suyo, sin lo de A ni su nota del NRC', async () => {
    const page = await graded.getGradedVideogames(ids.profB, 50, 1);
    expect(page.data.map((g) => g.videogameName)).toEqual([`Juego J2 ${tag}`]);
  });

  it('las búsquedas tampoco traen los equipos del NRC', async () => {
    const search = await graded.searchGradedGames(ids.profA, tag);
    expect(search.data.map((g) => g.videogameName)).toEqual([`Juego J1 ${tag}`]);
    const quick = await graded.quickSearchGradedGames(ids.profA, tag);
    expect(quick.data.map((g) => g.name)).toEqual([`Juego J1 ${tag}`]);
  });

  it('evaluaciones del profesor como jurado: tampoco la nota del NRC', async () => {
    const result = await professors.getJurorEvaluations(ids.profA, 20, 1);
    expect(result.data.map((r) => r.videogame)).toEqual([`Juego J1 ${tag}`]);
  });

  it('Calificaciones Uninorte conserva la nota del profesor', async () => {
    const row = await prisma.evaluation.findUnique({
      where: {
        jurado_videojuego_unique: { jurorId: ids.profA, videogameId: ids.games.NA },
      },
      select: { totalScore: true },
    });
    expect(row?.totalScore).toBe(3.5);
  });
});
