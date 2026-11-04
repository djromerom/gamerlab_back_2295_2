import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TeamRepository } from '../teams/repositories/team.repository';
import { EditionStudentsService } from './edition-students.service';

/**
 * Integración (ARK-129 / HU-26) contra Postgres real: el mismo estudiante en dos ediciones con
 * estados distintos, y un estudiante de la edición anterior que no aparece en la nueva.
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 * Crea sus propios datos en ediciones de 2099 (INACTIVE) y los borra al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Estudiantes por edición (BD real)', () => {
  const prisma = new PrismaService();
  const service = new EditionStudentsService(prisma);
  const repository = new TeamRepository(prisma, {} as any);
  const tag = randomUUID().slice(0, 6);
  const ids = { previous: 0, current: 0, users: [] as string[], teams: [] as number[] };
  const email = (key: string) => `${key}-${tag}@hu26.test`;

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2099,
        semester,
        title: `HU-26 ${tag} ${semester}`,
        startsAt: new Date('2099-01-01T00:00:00Z'),
        endsAt: new Date('2099-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  const team = async (
    key: string,
    leaderId: string,
    editionId: number,
    status: string,
    members: { key: string; code: string; isActive?: boolean }[],
  ) => {
    const statusRow = await prisma.videogameStatus.findUniqueOrThrow({ where: { status } });
    const created = await prisma.team.create({
      data: {
        teamName: `Equipo ${key} ${tag}`,
        teamCode: `T${key}${tag}`.slice(0, 12),
        userId: leaderId,
        editionId,
        members: {
          create: members.map((m) => ({
            firstName: m.key,
            lastName: 'Prueba',
            email: email(m.key),
            studentCode: `${m.code}${tag}`,
            editionId,
            isActive: m.isActive ?? true,
          })),
        },
        videogame: {
          create: { name: `Juego ${key}`, videogameStatusId: statusRow.id },
        },
      },
      select: { id: true },
    });
    ids.teams.push(created.id);
  };

  beforeAll(async () => {
    await prisma.$connect();
    ids.previous = (await edition(10)).id;
    ids.current = (await edition(20)).id;
    const studentRole = await prisma.role.findFirstOrThrow({ where: { name: 'Estudiante' } });
    const confirmed = await prisma.confirmationStatus.findUniqueOrThrow({
      where: { status: 'CONFIRMADO' },
    });
    const leader = await prisma.user.create({
      data: {
        email: email('ana'),
        firstName: 'ana',
        lastName: 'Prueba',
        roleId: studentRole.id,
        confirmationStatusId: confirmed.id,
      },
      select: { id: true },
    });
    ids.users.push(leader.id);

    // Edición anterior: Ana lidera un equipo CONFIRMADO con Beto
    await team('A', leader.id, ids.previous, 'CONFIRMADO', [
      { key: 'ana', code: '1' },
      { key: 'beto', code: '2' },
    ]);
    // Edición actual: Ana vuelve a inscribirse con otro equipo (PENDIENTE) y queda inactiva;
    // Beto no se inscribió.
    await team('B', leader.id, ids.current, 'PENDIENTE', [
      { key: 'ana', code: '1', isActive: false },
      { key: 'caro', code: '3' },
    ]);
  });

  afterAll(async () => {
    await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.edition.deleteMany({ where: { id: { in: [ids.previous, ids.current] } } });
    await prisma.$disconnect();
  });

  const byEmail = (list: { email: string }[], key: string) =>
    list.find((item) => item.email === email(key));

  it('el mismo estudiante tiene un estado distinto en cada edición', async () => {
    const previous = await service.list({ editionId: ids.previous, page: 1, limit: 20 });
    const current = await service.list({ editionId: ids.current, page: 1, limit: 20 });

    expect(byEmail(previous.data, 'ana')).toMatchObject({
      isActive: true,
      isLeader: true,
      videogameStatus: 'CONFIRMADO',
      accountStatus: 'CONFIRMADO',
      team: { teamName: `Equipo A ${tag}` },
    });
    expect(byEmail(current.data, 'ana')).toMatchObject({
      isActive: false,
      isLeader: true,
      videogameStatus: 'PENDIENTE',
      // la cuenta es global: el mismo estado en las dos ediciones
      accountStatus: 'CONFIRMADO',
      team: { teamName: `Equipo B ${tag}` },
    });
  });

  it('quien participó antes no aparece en la edición nueva hasta inscribirse', async () => {
    const current = await service.list({ editionId: ids.current, page: 1, limit: 20 });
    expect(byEmail(current.data, 'beto')).toBeUndefined();
    expect(current.data.map((s) => s.email).sort()).toEqual([email('ana'), email('caro')].sort());
    expect(byEmail(current.data, 'caro')).toMatchObject({ isLeader: false, accountStatus: null });
  });

  it('el resumen cuenta solo los integrantes de la edición', async () => {
    const current = await service.list({ editionId: ids.current, page: 1, limit: 20 });
    expect(current.summary).toEqual({
      total: 2,
      active: 1,
      inactive: 1,
      byVideogameStatus: { PENDIENTE: 2, CONFIRMADO: 0, RECHAZADO: 0 },
    });
    expect(current.edition).toMatchObject({ id: ids.current, readOnly: true });
  });

  it('filtra por estado del videojuego y por búsqueda', async () => {
    const confirmed = await service.list({
      editionId: ids.previous,
      videogameStatus: 'CONFIRMADO',
      page: 1,
      limit: 20,
    });
    expect(confirmed.data).toHaveLength(2);
    const none = await service.list({
      editionId: ids.current,
      videogameStatus: 'CONFIRMADO',
      page: 1,
      limit: 20,
    });
    expect(none.data).toHaveLength(0);
    const search = await service.list({ editionId: ids.current, search: 'caro', page: 1, limit: 20 });
    expect(search.data.map((s) => s.email)).toEqual([email('caro')]);
  });

  it('GET /teams (repositorio) devuelve solo los equipos de la edición pedida', async () => {
    const previous = await repository.findAll(false, ids.previous);
    const current = await repository.findPaged(1, 50, false, ids.current);
    expect(previous.map((t) => t.teamName)).toEqual([`Equipo A ${tag}`]);
    expect(current.data.map((t) => t.teamName)).toEqual([`Equipo B ${tag}`]);
    expect(current.metaData.totalItems).toBe(1);
  });
});
