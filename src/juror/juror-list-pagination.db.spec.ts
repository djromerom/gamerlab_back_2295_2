import {
  EditionStatus,
  JurorEditionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JurorService } from './juror.service';

/**
 * Integración (ARK-156 / BG-33) contra Postgres real: la pantalla de asignación recorre
 * `GET /juror?participating=true` en páginas de 100. Con más de 100 jurados y el mismo apellido,
 * al recorrerlas aparecen todos una sola vez y siguen fuera los Pendientes y los que Declinaron.
 *
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

const CONFIRMED_JURORS = 105;
const PAGE_LIMIT = 100;

maybe('Lista de jurados de la edición por páginas (BD real)', () => {
  const prisma = new PrismaService();
  const jurors = new JurorService({} as any, prisma, {} as any);

  const tag = randomUUID().slice(0, 6);
  const ids = {
    edition: 0,
    wasActive: [] as number[],
    confirmed: [] as string[],
    excluded: [] as string[],
  };
  const allUsers = () => [...ids.confirmed, ...ids.excluded];

  beforeAll(async () => {
    await prisma.$connect();
    ids.edition = (
      await prisma.edition.create({
        data: {
          year: 2099,
          semester: 56,
          title: `BG-33 ${tag}`,
          startsAt: new Date('2099-01-01T00:00:00Z'),
          endsAt: new Date('2099-01-02T00:00:00Z'),
          status: EditionStatus.INACTIVE,
        },
        select: { id: true },
      })
    ).id;

    const role = await prisma.role.findFirstOrThrow({
      where: { name: 'Jurado' },
    });
    const person = (key: string) => ({
      id: `${tag}-${key}`,
      email: `${key}-${tag}@bg33.test`,
      firstName: key,
      // Todos con el mismo apellido: el orden solo se decide con el `id`
      lastName: `Repetido ${tag}`,
      roleId: role.id,
      isActive: true,
    });

    ids.confirmed = Array.from(
      { length: CONFIRMED_JURORS },
      (_, i) => `${tag}-c${i}`,
    );
    ids.excluded = [`${tag}-pendiente`, `${tag}-declino`];
    await prisma.user.createMany({
      data: [
        ...Array.from({ length: CONFIRMED_JURORS }, (_, i) => person(`c${i}`)),
        person('pendiente'),
        person('declino'),
      ],
    });
    await prisma.jurorEdition.createMany({
      data: [
        ...ids.confirmed.map((jurorId) => ({
          jurorId,
          editionId: ids.edition,
          status: JurorEditionStatus.CONFIRMED,
        })),
        {
          jurorId: `${tag}-pendiente`,
          editionId: ids.edition,
          status: JurorEditionStatus.PENDING,
        },
        {
          jurorId: `${tag}-declino`,
          editionId: ids.edition,
          status: JurorEditionStatus.DECLINED,
        },
      ],
    });

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

    await jurors.onModuleInit();
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
      await prisma.jurorEdition.deleteMany({
        where: { jurorId: { in: allUsers() } },
      });
      await prisma.user.deleteMany({ where: { id: { in: allUsers() } } });
      await prisma.edition.deleteMany({ where: { id: ids.edition } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('una sola página de 100 no alcanza: por eso la pantalla las recorre', async () => {
    const first = await jurors.findAll(false, PAGE_LIMIT, 1, undefined, true);
    expect(first.data).toHaveLength(PAGE_LIMIT);
    expect(first.metadata).toMatchObject({
      totalItems: CONFIRMED_JURORS,
      totalPages: 2,
    });
  });

  it('al recorrer las páginas aparecen todos, una sola vez y sin Pendientes ni Declinados', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 2; page++) {
      const { data } = await jurors.findAll(
        false,
        PAGE_LIMIT,
        page,
        undefined,
        true,
      );
      seen.push(...data.map((j) => j.id));
    }

    expect(seen).toHaveLength(CONFIRMED_JURORS);
    expect(new Set(seen).size).toBe(CONFIRMED_JURORS);
    expect([...seen].sort()).toEqual([...ids.confirmed].sort());
    for (const id of ids.excluded) expect(seen).not.toContain(id);
  });
});
