import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { JurorEditionService } from './juror-edition.service';
import { jurorsOfEdition } from './jurors-of-edition';

/**
 * Integración (HU-25): `jurorsOfEdition` y el servicio contra Postgres real. Los mocks no
 * prueban que el filtro de Prisma signifique lo que se espera (lección de #202).
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 * Crea sus propios datos en ediciones de 2099 (INACTIVE) y los borra al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Jurados por edición (BD real)', () => {
  const prisma = new PrismaService();
  const service = new JurorEditionService(prisma);
  const tag = randomUUID().slice(0, 8);
  const ids = {
    previous: 0,
    current: 0,
    other: 0,
    subject: 0,
    users: [] as string[],
  };
  const user: Record<string, string> = {};

  const createUser = async (key: string, role: string, isActive = true) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu25.test`,
        firstName: key,
        lastName: 'Prueba',
        roleId: roleRow.id,
        isActive,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    user[key] = created.id;
  };

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2099,
        semester,
        title: `HU-25 ${tag} ${semester}`,
        startsAt: new Date('2099-01-01T00:00:00Z'),
        endsAt: new Date('2099-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  beforeAll(async () => {
    await prisma.$connect();
    ids.previous = (await edition(10)).id;
    ids.current = (await edition(20)).id;
    ids.other = (await edition(30)).id;
    ids.subject = (
      await prisma.subject.create({
        data: { name: `HU-25 ${tag}`, code: `HU25${tag}`, semester: 1 },
        select: { id: true },
      })
    ).id;

    await createUser('confirmado', 'Jurado');
    await createUser('pendiente', 'Jurado');
    await createUser('declino', 'Jurado');
    await createUser('nuevo', 'Jurado');
    await createUser('inactivo', 'Jurado', false);
    await createUser('profe', 'Profesor');
    await createUser('profeNrcInactivo', 'Profesor');
    await createUser('profeOtraEdicion', 'Profesor');

    const nrc = (professorId: string, editionId: number, isActive = true) =>
      prisma.nRC.create({
        data: {
          code: Math.floor(Math.random() * 1e9),
          subjectId: ids.subject,
          professorId,
          editionId,
          isActive,
        },
      });
    await nrc(user.profe, ids.current);
    await nrc(user.profeNrcInactivo, ids.current, false);
    await nrc(user.profeOtraEdicion, ids.other);

    await prisma.jurorEdition.createMany({
      data: [
        // edición anterior: dos confirmados (uno ya inactivo) y un declinado
        {
          jurorId: user.confirmado,
          editionId: ids.previous,
          status: 'CONFIRMED',
          type: 'BACKUP',
        },
        {
          jurorId: user.inactivo,
          editionId: ids.previous,
          status: 'CONFIRMED',
        },
        { jurorId: user.declino, editionId: ids.previous, status: 'DECLINED' },
      ],
    });
  });

  afterAll(async () => {
    // Datos propios de la prueba en una base desechable: se borran por id.
    await prisma.jurorEdition.deleteMany({
      where: { editionId: { in: [ids.previous, ids.current, ids.other] } },
    });
    await prisma.nRC.deleteMany({ where: { subjectId: ids.subject } });
    await prisma.subject.deleteMany({ where: { id: ids.subject } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.edition.deleteMany({
      where: { id: { in: [ids.previous, ids.current, ids.other] } },
    });
    await prisma.$disconnect();
  });

  it('trae de la anterior solo a los confirmados activos, como Pendientes y con su tipo', async () => {
    const first = await service.importPrevious(
      { editionId: ids.current },
      user.profe,
    );
    expect(first).toEqual({
      sourceEditionId: ids.previous,
      created: 1,
      skipped: 0,
      fallback: false,
    });

    const again = await service.importPrevious(
      { editionId: ids.current },
      user.profe,
    );
    expect(again).toMatchObject({ created: 0, skipped: 1 });

    const row = await prisma.jurorEdition.findUniqueOrThrow({
      where: {
        jurorId_editionId: { jurorId: user.confirmado, editionId: ids.current },
      },
    });
    expect(row).toMatchObject({ status: 'PENDING', type: 'BACKUP' });
  });

  it('jurorsOfEdition: confirmados y profesores con NRC activo en la edición, nadie más', async () => {
    await service.enroll(
      { editionId: ids.current, email: `pendiente-${tag}@hu25.test` },
      user.profe,
    );
    await service.enroll(
      { editionId: ids.current, email: `nuevo-${tag}@hu25.test` },
      user.profe,
    );
    // confirmado (traído) sigue Pendiente; pendiente pasa a Pendiente; nuevo queda Confirmado.
    const result = await service.updateStatus(
      {
        editionId: ids.current,
        items: [{ jurorId: user.pendiente, status: 'PENDING' }],
      },
      user.profe,
    );
    expect(result.results).toEqual([{ jurorId: user.pendiente, ok: true }]);

    const found = await prisma.user.findMany({
      where: { ...jurorsOfEdition(ids.current), id: { in: ids.users } },
      select: { id: true },
    });
    expect(found.map((u) => u.id).sort()).toEqual(
      [user.nuevo, user.profe].sort(),
    );
  });

  it('declineRemaining declina a los Pendientes no enviados y la lista lo refleja', async () => {
    const result = await service.updateStatus(
      {
        editionId: ids.current,
        declineRemaining: true,
        items: [{ jurorId: user.confirmado, status: 'CONFIRMED' }],
      },
      user.profe,
    );
    expect(result.declined).toBe(1); // "pendiente"

    const page = await service.list({
      editionId: ids.current,
      page: 1,
      limit: 100,
    });
    const statusOf = Object.fromEntries(
      page.data.map((item) => [item.jurorId, item.status]),
    );
    expect(statusOf).toEqual({
      [user.confirmado]: 'CONFIRMED',
      [user.nuevo]: 'CONFIRMED',
      [user.pendiente]: 'DECLINED',
      [user.profe]: 'AUTOMATIC',
    });
    expect(page.counts).toEqual({
      PENDING: 0,
      CONFIRMED: 2,
      DECLINED: 1,
      AUTOMATIC: 1,
    });
  });
});
