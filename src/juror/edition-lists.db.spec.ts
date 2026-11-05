import { EditionStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JurorService } from './juror.service';
import { TeamRepository } from '../teams/repositories/team.repository';
import { VideogamesService as PendingGamesService } from '../pending-games/pg.service';
import { GradedGamesService } from '../graded-games/gg.service';
import { ProfessorsService } from '../professors/professors.service';

/**
 * Integración (ARK-132 / BG-19) contra Postgres real: con dos ediciones, las listas de equipos y
 * jurados, el panel del jurado y las evaluaciones del profesor como jurado muestran por defecto
 * solo la edición activa, y la anterior se consulta con `editionId`.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Crea dos
 * ediciones de 2099; durante la prueba la «actual» es la ACTIVE y la(s) activa(s) del seed pasan a
 * INACTIVE. Al terminar restaura los estados y borra lo que creó.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Listas por edición: equipos, jurados y panel del jurado (BD real)', () => {
  const prisma = new PrismaService();
  const blobRefs = { resolveInPlace: () => Promise.resolve() } as any;
  const jurors = new JurorService({} as any, prisma, {} as any);
  const repository = new TeamRepository(prisma, {} as any);
  const pending = new PendingGamesService(prisma, blobRefs);
  const graded = new GradedGamesService(prisma, blobRefs);
  const professors = new ProfessorsService({} as any, prisma, {} as any);

  const tag = randomUUID().slice(0, 6);
  const ids = {
    previous: 0,
    current: 0,
    wasActive: [] as number[],
    users: [] as string[],
    teams: [] as number[],
    juror: '',
    professor: '',
    games: {} as Record<string, number>,
    teamByKey: {} as Record<string, number>,
  };

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2099,
        semester,
        title: `BG-19 ${tag} ${semester}`,
        startsAt: new Date('2099-01-01T00:00:00Z'),
        endsAt: new Date('2099-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  const user = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({ where: { name: role } });
    const created = await prisma.user.create({
      data: {
        email: `${key.toLowerCase()}-${tag}@bg19.test`,
        firstName: key,
        // «AAA»: queda primero en el listado paginado de jurados (orden por apellido)
        lastName: `AAA ${tag}`,
        roleId: roleRow.id,
        isActive: true,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    return created.id;
  };

  const team = async (key: string, editionId: number, jurorIds: string[]) => {
    const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    // El líder es único por edición (ARK-128): un estudiante por equipo
    const leader = await user(`lider${key}`, 'Estudiante');
    const created = await prisma.team.create({
      data: {
        teamName: `Equipo ${key} ${tag}`,
        teamCode: `N1-${key}${tag}`.slice(0, 12),
        userId: leader,
        editionId,
        assignedJurors: { connect: jurorIds.map((id) => ({ id })) },
        videogame: {
          create: { name: `Juego ${key} ${tag}`, videogameStatusId: confirmed.id },
        },
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    ids.teams.push(created.id);
    ids.teamByKey[key] = created.id;
    ids.games[key] = created.videogame!.id;
  };

  // ARK-147: una evaluación de jurado siempre trae sus detalles por criterio
  const evaluate = async (jurorId: string, key: string, editionId: number) => {
    const criterion = await prisma.criterion.findFirstOrThrow({
      where: { isActive: true },
    });
    return prisma.evaluation.create({
      data: {
        jurorId,
        videogameId: ids.games[key],
        editionId,
        totalScore: 4,
        details: { create: [{ criterionId: criterion.id, score: 4 }] },
      },
    });
  };

  beforeAll(async () => {
    await prisma.$connect();
    ids.previous = (await edition(10)).id;
    ids.current = (await edition(30)).id;
    ids.juror = await user('jurado', 'Jurado');
    ids.professor = await user('profesor', 'Profesor');

    // Edición anterior: un equipo calificado por el jurado y por el profesor
    await team('P', ids.previous, [ids.juror]);
    await evaluate(ids.juror, 'P', ids.previous);
    await evaluate(ids.professor, 'P', ids.previous);
    // Edición actual: un equipo pendiente y otro calificado por el jurado; el profesor califica C
    await team('C', ids.current, [ids.juror]);
    await team('D', ids.current, [ids.juror]);
    await evaluate(ids.juror, 'D', ids.current);
    await evaluate(ids.professor, 'C', ids.current);

    // La edición «actual» es la activa durante la prueba (con evaluaciones abiertas)
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
    await prisma.eventConfiguration.create({
      data: { editionId: ids.current, evaluationsOpen: true },
    });

    await jurors.onModuleInit();
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
      await prisma.eventConfiguration.deleteMany({
        where: { editionId: { in: [ids.previous, ids.current] } },
      });
      await prisma.evaluation.deleteMany({
        where: { videogameId: { in: Object.values(ids.games) } },
      });
      await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({
        where: { id: { in: [ids.previous, ids.current] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  const ourTeams = (names: string[]) => names.filter((n) => n.endsWith(tag)).sort();

  it('equipos con menos de 3 jurados: solo los de la edición pedida', async () => {
    const current = await repository.getTeamsWithLessThanThreeJurors(ids.current);
    const previous = await repository.getTeamsWithLessThanThreeJurors(ids.previous);
    expect(ourTeams(current.map((t) => t.nombre))).toEqual([
      `Equipo C ${tag}`,
      `Equipo D ${tag}`,
    ]);
    expect(ourTeams(previous.map((t) => t.nombre))).toEqual([`Equipo P ${tag}`]);
  });

  it('JurorService.getTeamsWithLessThanThreeJurors: por defecto la activa', async () => {
    const byDefault = await jurors.getTeamsWithLessThanThreeJurors();
    expect(ourTeams(byDefault.map((t) => t.nombre))).toEqual([
      `Equipo C ${tag}`,
      `Equipo D ${tag}`,
    ]);
    const previous = await jurors.getTeamsWithLessThanThreeJurors(ids.previous);
    expect(ourTeams(previous.map((t) => t.nombre))).toEqual([`Equipo P ${tag}`]);
  });

  it('evaluadores con equipos: la carga cuenta solo la edición pedida', async () => {
    const byDefault = await jurors.getEvaluatorsWithTeams();
    const mine = byDefault.find((e) => e.id === ids.juror);
    expect(mine.cantidadEquipos).toBe(2);
    expect(mine.equiposAsignados.map((t: any) => t.id).sort()).toEqual(
      [ids.teamByKey.C, ids.teamByKey.D].sort(),
    );

    const previous = await jurors.getEvaluatorsWithTeams(ids.previous);
    const minePrev = previous.find((e) => e.id === ids.juror);
    expect(minePrev.cantidadEquipos).toBe(1);
    expect(minePrev.equiposAsignados[0].id).toBe(ids.teamByKey.P);
  });

  it('equipos de un jurado: por defecto la activa; con editionId, el historial', async () => {
    const byDefault = await jurors.getTeamsAssignedToJuror(ids.juror);
    expect(byDefault.map((t) => t.id).sort()).toEqual(
      [ids.teamByKey.C, ids.teamByKey.D].sort(),
    );
    const previous = await jurors.getTeamsAssignedToJuror(ids.juror, ids.previous);
    expect(previous.map((t) => t.id)).toEqual([ids.teamByKey.P]);
  });

  it('una edición que no existe responde 404, no 500', async () => {
    await expect(jurors.getEvaluatorsWithTeams(999999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      jurors.getTeamsAssignedToJuror(ids.juror, 999999),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listado de jurados: evaluados y pendientes solo de la edición', async () => {
    const page = await jurors.findAll(false, 50, 1);
    const mine = page.data.find((j) => j.id === ids.juror)!;
    expect(mine.evaluatedGameNames).toEqual([`Juego D ${tag}`]);
    expect(mine.unevaluatedGameNames).toEqual([`Juego C ${tag}`]);

    const previous = await jurors.findAll(false, 50, 1, ids.previous);
    const minePrev = previous.data.find((j) => j.id === ids.juror)!;
    expect(minePrev.evaluatedGameNames).toEqual([`Juego P ${tag}`]);
    expect(minePrev.unevaluatedGameNames).toEqual([]);
  });

  it('panel del jurado: pendientes y calificados solo de la edición activa', async () => {
    const pend = await pending.getPendingVideogames(ids.juror, 50, 1);
    expect(pend.data.map((g) => g.videogameName)).toEqual([`Juego C ${tag}`]);
    expect(await pending.getPendingVideogamesCount(ids.juror)).toBe(1);

    const done = await graded.getGradedVideogames(ids.juror, 50, 1);
    expect(done.data.map((g) => g.videogameName)).toEqual([`Juego D ${tag}`]);
    expect(await graded.getGradedVideogamesCount(ids.juror)).toBe(1);

    const search = await pending.quickSearchPendingGames(ids.juror, tag);
    expect(search.data.map((g) => g.name)).toEqual([`Juego C ${tag}`]);
    const searchDone = await graded.quickSearchGradedGames(ids.juror, tag);
    expect(searchDone.data.map((g) => g.name)).toEqual([`Juego D ${tag}`]);
  });

  it('evaluaciones del profesor como jurado: por edición y dice cuál', async () => {
    const byDefault = await professors.getJurorEvaluations(ids.professor, 20, 1);
    expect(byDefault.edition).toMatchObject({ id: ids.current, readOnly: false });
    expect(byDefault.data.map((r) => r.videogame)).toEqual([`Juego C ${tag}`]);

    const previous = await professors.getJurorEvaluations(
      ids.professor,
      20,
      1,
      ids.previous,
    );
    expect(previous.edition).toMatchObject({ id: ids.previous, readOnly: true });
    expect(previous.data.map((r) => r.videogame)).toEqual([`Juego P ${tag}`]);
    expect(previous.metadata.totalItems).toBe(1);
  });
});
