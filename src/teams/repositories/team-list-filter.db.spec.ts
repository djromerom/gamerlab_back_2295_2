import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TeamRepository } from './team.repository';

/**
 * BG-53 (ARK-253) contra Postgres real: `search` y `origin` de GET /teams se filtran en la consulta
 * y el total de `metaData` es el filtrado. 30 equipos en una edición propia (INACTIVE): cada
 * tercero es externo y el 25 («Cóndor Ñandú», juego «Vuelo Andino») cae en la página 3 con limit 10.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('GET /teams: búsqueda y origen (BD real)', () => {
  const prisma = new PrismaService();
  // `any`: la contraprueba con el código anterior debe fallar en las aserciones, no al compilar
  const repository: any = new TeamRepository(prisma, {} as any);
  const tag = randomUUID().slice(0, 6);
  const users: string[] = [];
  const teamIds: number[] = [];
  let editionId = 0;
  const TOTAL = 30;
  const isExternal = (n: number) => n % 3 === 0; // 10 externos, 20 de Uninorte
  const code = (n: number) => `N1-${tag}${n}`;

  const paged = (page: number, limit: number, filters?: object, sortByLikes = false) =>
    repository.findPaged(page, limit, sortByLikes, editionId, filters);

  beforeAll(async () => {
    await prisma.$connect();
    const edition = await prisma.edition.create({
      data: {
        year: 2094,
        semester: 900 + Math.floor(Math.random() * 90),
        title: `BG-53 ${tag}`,
        startsAt: new Date('2094-01-01T00:00:00Z'),
        endsAt: new Date('2094-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });
    editionId = edition.id;
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'Estudiante' } });
    const status = await prisma.videogameStatus.findUniqueOrThrow({ where: { status: 'CONFIRMADO' } });
    for (let n = 1; n <= TOTAL; n++) {
      const leader = await prisma.user.create({
        data: { email: `lider${n}-${tag}@bg53.test`, firstName: 'Líder', lastName: `BG53 ${tag}`, roleId: role.id },
        select: { id: true },
      });
      users.push(leader.id);
      const team = await prisma.team.create({
        data: {
          teamName: n === 25 ? `Cóndor Ñandú ${tag}` : `Equipo ${n} ${tag}`,
          teamCode: code(n),
          userId: leader.id,
          editionId,
          isExternal: isExternal(n),
          videogame: {
            create: { name: n === 25 ? 'Vuelo Andino' : `Juego ${n}`, videogameStatusId: status.id },
          },
        },
        select: { id: true },
      });
      teamIds.push(team.id);
    }
  });

  afterAll(async () => {
    try {
      await prisma.team.deleteMany({ where: { editionId } });
      await prisma.edition.deleteMany({ where: { id: editionId } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('sin parámetros nuevos responde igual que antes: 30 equipos, 3 páginas, el 25 en la página 3', async () => {
    const first = await paged(1, 10);
    expect(first.metaData).toMatchObject({ totalItems: TOTAL, totalPages: 3, itemsOnCurrentPage: 10 });
    expect(first.data.map((t: any) => t.id)).toEqual(teamIds.slice(0, 10));
    const third = await paged(3, 10);
    expect(third.data.map((t: any) => t.teamName)).toContain(`Cóndor Ñandú ${tag}`);
    expect(await repository.findAll(false, editionId)).toHaveLength(TOTAL);
  });

  it('buscar un equipo de la página 3 lo encuentra en la página 1 con total 1 (sin tilde)', async () => {
    const res = await paged(1, 10, { search: 'condor' });
    expect(res.data.map((t: any) => t.id)).toEqual([teamIds[24]]);
    expect(res.metaData).toMatchObject({ totalItems: 1, totalPages: 1, itemsOnCurrentPage: 1, hasNextPage: false });
  });

  it('busca por nombre del juego, por código y con varias palabras', async () => {
    expect((await paged(1, 10, { search: 'ANDINO' })).data.map((t: any) => t.id)).toEqual([teamIds[24]]);
    const byCode = await paged(1, 10, { search: code(7).toLowerCase() });
    expect(byCode.data.map((t: any) => t.id)).toEqual([teamIds[6]]);
    expect(byCode.metaData.totalItems).toBe(1);
    expect((await paged(1, 10, { search: 'ñandu vuelo' })).metaData.totalItems).toBe(1);
    expect((await paged(1, 10, { search: 'condor mazmorra' })).metaData).toMatchObject({ totalItems: 0, totalPages: 0 });
  });

  it('la búsqueda respeta sortByLikes y la lista completa', async () => {
    expect((await paged(1, 10, { search: 'condor' }, true)).data).toHaveLength(1);
    const all = await repository.findAll(false, editionId, { search: 'equipo' });
    expect(all).toHaveLength(TOTAL - 1);
  });

  it('origin=externo trae todos los externos y la paginación coincide con el contador', async () => {
    const externals = teamIds.filter((_, i) => isExternal(i + 1));
    const page1 = await paged(1, 4, { origin: 'externo' });
    expect(page1.metaData).toMatchObject({ totalItems: 10, totalPages: 3, hasNextPage: true });
    const page3 = await paged(3, 4, { origin: 'externo' });
    expect(page3.data).toHaveLength(2);
    const ids = [...page1.data, ...(await paged(2, 4, { origin: 'externo' })).data, ...page3.data].map((t: any) => t.id);
    expect(ids).toEqual(externals);
    const all = await repository.findAll(false, editionId, { origin: 'externo' });
    expect(all.every((t: any) => t.isExternal)).toBe(true);
    expect(all).toHaveLength(10);
  });

  it('origin=uninorte trae el resto', async () => {
    const res = await paged(1, 50, { origin: 'uninorte' });
    expect(res.metaData.totalItems).toBe(20);
    expect(res.data.every((t: any) => t.isExternal === false)).toBe(true);
  });

  it('search y origin se combinan', async () => {
    expect((await paged(1, 10, { search: 'condor', origin: 'externo' })).metaData.totalItems).toBe(0);
    expect((await paged(1, 10, { search: 'condor', origin: 'uninorte' })).metaData.totalItems).toBe(1);
    expect((await paged(1, 10, { search: 'equipo', origin: 'externo' })).metaData.totalItems).toBe(10);
  });
});
