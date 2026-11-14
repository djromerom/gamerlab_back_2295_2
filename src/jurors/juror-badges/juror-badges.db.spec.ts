import { NotFoundException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CertificatesService } from 'src/certificates/certificates.service';
import { JurorCheckinService } from 'src/jurors/juror-checkin/juror-checkin.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { JurorBadgesService } from './juror-badges.service';

/**
 * Integración (BG-16): escarapelas y check-in solo para los jurados de la edición activa,
 * contra Postgres real. Solo corre con RUN_DB_TESTS=1 sobre una base desechable con
 * migraciones y seed. Usa la edición activa (o crea una de 2099 si no hay) y borra sus datos.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('BG-16: escarapelas y check-in por edición (BD real)', () => {
  const prisma = new PrismaService();
  const badges = new JurorBadgesService(
    prisma,
    {} as unknown as CertificatesService,
  );
  const checkin = new JurorCheckinService(prisma, badges);
  const tag = randomUUID().slice(0, 8);
  const ids = {
    active: 0,
    createdActive: false,
    other: 0,
    subject: 0,
    users: [] as string[],
  };
  const user: Record<string, string> = {};

  const createUser = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@bg16.test`,
        firstName: key,
        lastName: 'Prueba',
        roleId: roleRow.id,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    user[key] = created.id;
  };

  const edition = (semester: number, status: EditionStatus) =>
    prisma.edition.create({
      data: {
        year: 2099,
        semester,
        title: `BG-16 ${tag} ${semester}`,
        startsAt: new Date('2099-01-01T00:00:00Z'),
        endsAt: new Date('2099-01-02T00:00:00Z'),
        status,
      },
      select: { id: true },
    });

  beforeAll(async () => {
    await prisma.$connect();
    const active = await prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (active) ids.active = active.id;
    else {
      ids.active = (await edition(10, EditionStatus.ACTIVE)).id;
      ids.createdActive = true;
    }
    ids.other = (await edition(20, EditionStatus.INACTIVE)).id;
    ids.subject = (
      await prisma.subject.create({
        data: { name: `BG-16 ${tag}`, code: `BG16${tag}`, semester: 1 },
        select: { id: true },
      })
    ).id;

    await createUser('confirmado', 'Jurado');
    await createUser('pendiente', 'Jurado');
    await createUser('sinEdicion', 'Jurado');
    await createUser('profe', 'Profesor');
    await createUser('profeOtraEdicion', 'Profesor');

    await prisma.jurorEdition.createMany({
      data: [
        {
          jurorId: user.confirmado,
          editionId: ids.active,
          status: 'CONFIRMED',
        },
        { jurorId: user.pendiente, editionId: ids.active, status: 'PENDING' },
      ],
    });
    const nrc = (professorId: string, editionId: number) =>
      prisma.nRC.create({
        data: {
          code: Math.floor(Math.random() * 1e9),
          subjectId: ids.subject,
          professorId,
          editionId,
        },
      });
    await nrc(user.profe, ids.active);
    await nrc(user.profeOtraEdicion, ids.other);

    // Escarapela vieja (creada antes de BG-16) de un jurado que no es de la edición.
    await prisma.jurorBadge.create({
      data: {
        jurorId: user.pendiente,
        editionId: ids.active,
        token: `bg16-viejo-${tag}`,
      },
    });
  });

  afterAll(async () => {
    // Datos propios de la prueba en una base desechable: se borran por id.
    await prisma.jurorAttendance.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.jurorBadge.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.jurorEdition.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.nRC.deleteMany({ where: { subjectId: ids.subject } });
    await prisma.subject.deleteMany({ where: { id: ids.subject } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.edition.deleteMany({
      where: {
        id: { in: ids.createdActive ? [ids.active, ids.other] : [ids.other] },
      },
    });
    await prisma.$disconnect();
  });

  it('generar solo crea escarapelas para el confirmado y el profesor con NRC en la edición', async () => {
    const result = await badges.generate(ids.users);

    expect(result.created).toBe(2);
    expect(result.skipped.map((s) => s.jurorId).sort()).toEqual(
      [user.pendiente, user.sinEdicion, user.profeOtraEdicion].sort(),
    );
    const owners = await prisma.jurorBadge.findMany({
      where: { jurorId: { in: ids.users }, isActive: true },
      select: { jurorId: true },
    });
    // El pendiente conserva su escarapela vieja (la desactiva el script de limpieza).
    expect(owners.map((o) => o.jurorId).sort()).toEqual(
      [user.confirmado, user.profe, user.pendiente].sort(),
    );
  });

  it('la lista no muestra la escarapela vieja del jurado pendiente', async () => {
    const { data } = await badges.list();
    const listed = data.map((b) => b.jurorId);
    expect(listed).toEqual(
      expect.arrayContaining([user.confirmado, user.profe]),
    );
    expect(listed).not.toContain(user.pendiente);
  });

  it('el QR viejo de quien no es de la edición responde 404 y no registra la llegada', async () => {
    await expect(
      checkin.checkInByToken(`bg16-viejo-${tag}`, user.profe),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await prisma.jurorAttendance.count({
        where: { jurorId: user.pendiente },
      }),
    ).toBe(0);
  });

  it('el QR del jurado confirmado sí registra la llegada', async () => {
    const badge = await prisma.jurorBadge.findFirstOrThrow({
      where: { jurorId: user.confirmado, isActive: true },
    });
    const result = await checkin.checkInByToken(badge.token, user.profe);
    expect(result.status).toBe('CHECKED_IN');
  });

  it('check-in manual y búsqueda excluyen a quien no es de la edición', async () => {
    await expect(
      checkin.checkInManually(user.profeOtraEdicion, user.profe),
    ).rejects.toBeInstanceOf(NotFoundException);

    const byName = await checkin.search('Prueba');
    const foundIds = byName.map((j) => j.id);
    expect(foundIds).not.toContain(user.pendiente);
    expect(foundIds).not.toContain(user.sinEdicion);
    expect(foundIds).not.toContain(user.profeOtraEdicion);
  });

  it('regenerar a quien no es de la edición responde 404', async () => {
    await expect(badges.regenerate(user.sinEdicion)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
