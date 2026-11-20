import { ConflictException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { JurorEditionService } from './juror-edition.service';
import { jurorsOfEdition } from './jurors-of-edition';

/**
 * Integración (HU-28, ARK-150): profesores sin NRC inscritos por correo contra Postgres real.
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed.
 * Crea sus propios datos en ediciones de 2098 (INACTIVE) y los borra al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('Profesores sin NRC en la edición (BD real)', () => {
  const prisma = new PrismaService();
  const service = new JurorEditionService(prisma);
  const tag = randomUUID().slice(0, 8);
  const ids = { current: 0, other: 0, subject: 0, users: [] as string[] };
  const user: Record<string, string> = {};
  const email = (key: string) => `${key}-${tag}@hu28.test`;

  const createUser = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: email(key),
        firstName: key,
        lastName: 'Prueba',
        roleId: roleRow.id,
        isActive: true,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    user[key] = created.id;
  };

  const edition = (semester: number) =>
    prisma.edition.create({
      data: {
        year: 2098,
        semester,
        title: `HU-28 ${tag} ${semester}`,
        startsAt: new Date('2098-01-01T00:00:00Z'),
        endsAt: new Date('2098-01-02T00:00:00Z'),
        status: EditionStatus.INACTIVE,
      },
      select: { id: true },
    });

  beforeAll(async () => {
    await prisma.$connect();
    ids.current = (await edition(10)).id;
    ids.other = (await edition(20)).id;
    ids.subject = (
      await prisma.subject.create({
        data: { name: `HU-28 ${tag}`, code: `HU28${tag}`, semester: 1 },
        select: { id: true },
      })
    ).id;

    await createUser('profeSinNrc', 'Profesor');
    await createUser('profeConNrc', 'Profesor');
    await createUser('profeOtraEdicion', 'Profesor');

    const nrc = (professorId: string, editionId: number) =>
      prisma.nRC.create({
        data: {
          code: Math.floor(Math.random() * 1e9),
          subjectId: ids.subject,
          professorId,
          editionId,
          isActive: true,
        },
      });
    await nrc(user.profeConNrc, ids.current);
    await nrc(user.profeOtraEdicion, ids.other);
  });

  afterAll(async () => {
    // Datos propios de la prueba en una base desechable: se borran por id.
    await prisma.jurorEdition.deleteMany({
      where: { editionId: { in: [ids.current, ids.other] } },
    });
    await prisma.nRC.deleteMany({ where: { subjectId: ids.subject } });
    await prisma.subject.deleteMany({ where: { id: ids.subject } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.edition.deleteMany({
      where: { id: { in: [ids.current, ids.other] } },
    });
    await prisma.$disconnect();
  });

  it('inscribe al profesor sin NRC y rechaza al que tiene NRC activo en la edición', async () => {
    const enrolled = await service.enroll(
      { editionId: ids.current, email: email('profeSinNrc') },
      user.profeSinNrc,
    );
    expect(enrolled).toMatchObject({
      jurorId: user.profeSinNrc,
      status: 'CONFIRMED',
      type: 'OFFICIAL',
      source: 'ENROLLED',
      category: 'Senior',
    });

    await expect(
      service.enroll(
        { editionId: ids.current, email: email('profeConNrc') },
        user.profeSinNrc,
      ),
    ).rejects.toThrow(ConflictException);

    // NRC solo en otra edición: se puede inscribir. Se deja Pendiente para probar el filtro.
    await service.enroll(
      { editionId: ids.current, email: email('profeOtraEdicion') },
      user.profeSinNrc,
    );
    await service.updateStatus(
      {
        editionId: ids.current,
        items: [{ jurorId: user.profeOtraEdicion, status: 'PENDING' }],
      },
      user.profeSinNrc,
    );
  });

  it('jurorsOfEdition incluye al profesor inscrito y confirmado, no al Pendiente', async () => {
    const found = await prisma.user.findMany({
      where: { ...jurorsOfEdition(ids.current), id: { in: ids.users } },
      select: { id: true },
    });
    expect(found.map((u) => u.id).sort()).toEqual(
      [user.profeSinNrc, user.profeConNrc].sort(),
    );
  });

  it('la lista los muestra una sola vez y con su origen', async () => {
    const page = await service.list({
      editionId: ids.current,
      page: 1,
      limit: 100,
    });
    const byId = Object.fromEntries(
      page.data.map((item) => [item.jurorId, [item.status, item.source]]),
    );
    expect(byId).toEqual({
      [user.profeSinNrc]: ['CONFIRMED', 'ENROLLED'],
      [user.profeOtraEdicion]: ['PENDING', 'ENROLLED'],
      [user.profeConNrc]: ['AUTOMATIC', 'PROFESSOR_NRC'],
    });
  });
});
