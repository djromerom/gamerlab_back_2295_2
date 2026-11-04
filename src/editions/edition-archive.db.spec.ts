import { BadRequestException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { HistoricalsService } from '../historicals/historicals.service';
import { EditionsService } from './editions.service';
import { assertTeamWritable, EDITION_READ_ONLY } from './active-edition';

/**
 * ARK-137 (TA-17): ensayo automatizado del cierre de edición contra Postgres real.
 *
 * Arma dos ediciones con equipos, integrantes, videojuegos, NRC, evaluaciones y asignaciones (la
 * misma estudiante lidera un equipo en cada una, BG-17), archiva una y comprueba:
 * - el volcado (solo equipos activos, integrantes con sus NRC, videojuego);
 * - que NO se borra ni cambia nada de las tablas de trabajo, ni de la otra edición;
 * - que la edición activa no cambia y que la archivada queda en solo lectura (HU-27);
 * - que no se puede archivar dos veces ni volcar suelto una edición sin archivar;
 * - que si el volcado falla a mitad, todo se deshace y se puede volver a intentar;
 * - que una edición sin equipos también se archiva.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Crea sus datos
 * en ediciones de 2097 y los borra al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Cierre de edición: archivar (BD real)', () => {
  const prisma = new PrismaService();
  // Las lecturas del historial firman URL de archivos; aquí no hay archivos que firmar.
  const blobRefs = {
    resolveTeamsVideogames: async (teams: unknown) => teams,
    resolveVideogame: async (videogame: unknown) => videogame,
  };
  const historicals = new HistoricalsService(prisma, blobRefs as any);
  const editions = new EditionsService(prisma, {} as any, historicals, {} as any);

  const tag = randomUUID().slice(0, 6);
  const email = (key: string) => `${key}-${tag}@ta17.test`;
  const ids = {
    closing: 0, // la edición que se archiva
    other: 0, // otra edición con datos que no debe tocarse
    rollback: 0, // edición para simular un fallo a mitad del volcado
    empty: 0, // edición sin equipos
    users: [] as string[],
    teams: {} as Record<string, number>,
    nrcs: [] as number[],
    subject: 0,
    activeBefore: null as { id: number; status: EditionStatus } | null,
  };

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2097,
        semester,
        title: `TA-17 ${tag} ${semester}`,
        startsAt: new Date('2097-01-01T00:00:00Z'),
        endsAt: new Date('2097-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  const user = async (key: string, roleName: string) => {
    const role = await prisma.role.findFirstOrThrow({ where: { name: roleName } });
    const created = await prisma.user.create({
      data: { email: email(key), firstName: key, lastName: 'Prueba', roleId: role.id },
      select: { id: true },
    });
    ids.users.push(created.id);
    return created.id;
  };

  const team = async (
    key: string,
    editionId: number,
    leaderId: string,
    nrcId: number,
    members: { key: string; code: string }[],
    opts: { isActive?: boolean; jurorId?: string; score?: number } = {},
  ) => {
    const confirmed = await prisma.videogameStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const created = await prisma.team.create({
      data: {
        teamName: `Equipo ${key} ${tag}`,
        teamCode: `N1-T${key}${tag}`.slice(0, 12),
        userId: leaderId,
        editionId,
        isActive: opts.isActive ?? true,
        members: {
          create: members.map((m) => ({
            firstName: m.key,
            lastName: 'Prueba',
            email: email(m.key),
            studentCode: `${m.code}${tag}`,
            editionId,
            nrcs: { connect: [{ id: nrcId }] },
          })),
        },
        videogame: { create: { name: `Juego ${key}`, videogameStatusId: confirmed.id } },
        ...(opts.jurorId && { assignedJurors: { connect: [{ id: opts.jurorId }] } }),
      },
      select: { id: true, videogame: { select: { id: true } } },
    });
    ids.teams[key] = created.id;
    if (opts.jurorId && opts.score !== undefined) {
      await prisma.evaluation.create({
        data: {
          jurorId: opts.jurorId,
          videogameId: created.videogame!.id,
          editionId,
          totalScore: opts.score,
        },
      });
    }
    return created.id;
  };

  /** Foto de las tablas de trabajo de una edición: lo que archivar NO debe cambiar. */
  const liveSnapshot = async (editionId: number) => ({
    teams: await prisma.team.count({ where: { editionId } }),
    members: await prisma.member.count({ where: { editionId } }),
    videogames: await prisma.videogame.count({ where: { team: { editionId } } }),
    evaluations: await prisma.evaluation.count({ where: { editionId } }),
    nrcs: await prisma.nRC.count({ where: { editionId } }),
    assignments: (
      await prisma.team.findMany({
        where: { editionId },
        select: { assignedJurors: { select: { id: true } } },
      })
    ).reduce((sum, t) => sum + t.assignedJurors.length, 0),
  });

  beforeAll(async () => {
    await prisma.$connect();
    ids.activeBefore = await prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      select: { id: true, status: true },
    });
    ids.closing = (await edition(10)).id;
    ids.other = (await edition(20)).id;
    ids.rollback = (await edition(30)).id;
    ids.empty = (await edition(40)).id;

    const professor = await user('profe', 'Profesor');
    const juror = await user('jurado', 'Jurado');
    const ana = await user('ana', 'Estudiante');
    const subject = await prisma.subject.create({
      data: { name: `Materia ${tag}`, code: `M${tag}`, semester: 1, abrevName: 'TST' },
      select: { id: true },
    });
    ids.subject = subject.id;
    const nrc = async (editionId: number, code: number) => {
      const created = await prisma.nRC.create({
        data: { code, subjectId: subject.id, professorId: professor, editionId },
        select: { id: true },
      });
      ids.nrcs.push(created.id);
      return created.id;
    };
    const nrcClosing = await nrc(ids.closing, 9701);
    const nrcOther = await nrc(ids.other, 9701); // mismo código, otra edición
    const nrcRollback = await nrc(ids.rollback, 9702);

    // Edición que se cierra: Ana lidera el equipo A (con Beto); B está inactivo y no se vuelca.
    await team('A', ids.closing, ana, nrcClosing, [
      { key: 'ana', code: '1' },
      { key: 'beto', code: '2' },
    ], { jurorId: juror, score: 4.5 });
    const inactiveLeader = await user('caro', 'Estudiante');
    await team('B', ids.closing, inactiveLeader, nrcClosing, [{ key: 'caro', code: '3' }], {
      isActive: false,
    });
    // Otra edición: Ana vuelve a liderar un equipo (BG-17), con jurado y evaluación.
    await team('C', ids.other, ana, nrcOther, [{ key: 'ana', code: '1' }], {
      jurorId: juror,
      score: 3.8,
    });
    // Edición para el fallo simulado
    await team('D', ids.rollback, ana, nrcRollback, [{ key: 'ana', code: '1' }]);
  });

  afterAll(async () => {
    const editionIds = [ids.closing, ids.other, ids.rollback, ids.empty];
    try {
      await prisma.historicalTeam.deleteMany({ where: { editionId: { in: editionIds } } });
      await prisma.team.deleteMany({ where: { id: { in: Object.values(ids.teams) } } });
      await prisma.nRC.deleteMany({ where: { id: { in: ids.nrcs } } });
      await prisma.subject.deleteMany({ where: { id: ids.subject } });
      await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
      await prisma.edition.deleteMany({ where: { id: { in: editionIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('archiva: vuelca solo los equipos activos y no toca los datos vivos', async () => {
    const closingBefore = await liveSnapshot(ids.closing);
    const otherBefore = await liveSnapshot(ids.other);
    expect(closingBefore).toEqual({
      teams: 2,
      members: 3,
      videogames: 2,
      evaluations: 1,
      nrcs: 1,
      assignments: 1,
    });

    const result = await editions.archive(ids.closing);

    expect(result.status).toBe(EditionStatus.ARCHIVED);

    // Volcado: el equipo A con sus dos integrantes, su NRC y su videojuego; el inactivo B no.
    const dumped = await prisma.historicalTeam.findMany({
      where: { editionId: ids.closing },
      include: { members: { include: { nrcs: true } }, videogame: true },
    });
    expect(dumped).toHaveLength(1);
    expect(dumped[0].teamName).toBe(`Equipo A ${tag}`);
    expect(dumped[0].members.map((m) => m.email).sort()).toEqual([email('ana'), email('beto')]);
    expect(dumped[0].members.every((m) => m.nrcs.length === 1 && m.nrcs[0].code === 9701)).toBe(
      true,
    );
    expect(dumped[0].videogame).toMatchObject({ name: 'Juego A', likes: 0 });

    // Nada de las tablas de trabajo cambia: ni en la edición cerrada ni en la otra.
    expect(await liveSnapshot(ids.closing)).toEqual(closingBefore);
    expect(await liveSnapshot(ids.other)).toEqual(otherBefore);
    expect(await prisma.historicalTeam.count({ where: { editionId: ids.other } })).toBe(0);
    // La otra edición sigue INACTIVE y la activa sigue siendo la misma
    expect(
      (await prisma.edition.findUniqueOrThrow({ where: { id: ids.other } })).status,
    ).toBe(EditionStatus.INACTIVE);
    expect(
      await prisma.edition.findFirst({
        where: { status: EditionStatus.ACTIVE },
        select: { id: true, status: true },
      }),
    ).toEqual(ids.activeBefore);
  });

  it('la edición archivada se lee en /ediciones-pasadas y queda en solo lectura', async () => {
    const withScores = await historicals.getHistoricalTeamsWithScores(ids.closing);
    expect(withScores.map((t) => t.teamName)).toEqual([`Equipo A ${tag}`]);
    const games = await historicals.getHistoricalVideogamesByEdition(ids.closing);
    expect(games.map((g: any) => g.name)).toEqual(['Juego A']);

    const error = await assertTeamWritable(prisma, ids.teams.A).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: EDITION_READ_ONLY });
  });

  it('no se archiva dos veces ni se duplica el volcado', async () => {
    await expect(editions.archive(ids.closing)).rejects.toThrow(BadRequestException);
    await expect(historicals.createHistoricalEditionDump(ids.closing)).rejects.toThrow(
      /ya tiene volcado/,
    );
    expect(await prisma.historicalTeam.count({ where: { editionId: ids.closing } })).toBe(1);
  });

  it('el volcado suelto no se permite sobre una edición sin archivar', async () => {
    await expect(historicals.createHistoricalEditionDump(ids.other)).rejects.toThrow(
      /POST \/editions\/\d+\/archive/,
    );
    expect(await prisma.historicalTeam.count({ where: { editionId: ids.other } })).toBe(0);
  });

  it('si el volcado falla a mitad, se deshace todo y se puede reintentar', async () => {
    const realDump = historicals.dumpEdition.bind(historicals);
    const spy = jest
      .spyOn(historicals, 'dumpEdition')
      .mockImplementationOnce(async (tx, editionId, opts) => {
        await realDump(tx, editionId, opts);
        throw new Error('falla simulada después de volcar');
      });

    await expect(editions.archive(ids.rollback)).rejects.toThrow('falla simulada');

    // Ni ARCHIVED ni volcado a medias
    expect(
      (await prisma.edition.findUniqueOrThrow({ where: { id: ids.rollback } })).status,
    ).toBe(EditionStatus.INACTIVE);
    expect(await prisma.historicalTeam.count({ where: { editionId: ids.rollback } })).toBe(0);

    spy.mockRestore();
    const retry = await editions.archive(ids.rollback);
    expect(retry.status).toBe(EditionStatus.ARCHIVED);
    expect(await prisma.historicalTeam.count({ where: { editionId: ids.rollback } })).toBe(1);
  });

  it('una edición sin equipos también se archiva', async () => {
    const result = await editions.archive(ids.empty);
    expect(result.status).toBe(EditionStatus.ARCHIVED);
    expect(await prisma.historicalTeam.count({ where: { editionId: ids.empty } })).toBe(0);
  });
});
