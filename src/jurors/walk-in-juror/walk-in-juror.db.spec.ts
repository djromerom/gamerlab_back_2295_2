import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { EditionStatus, JurorEditionStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthService } from 'src/auth/auth.service';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { WalkInJurorService } from './walk-in-juror.service';

/**
 * Integración (HU-24) contra Postgres real. Solo corre con RUN_DB_TESTS=1 sobre una base desechable
 * con migraciones y seed. Usa la edición activa (o crea una de 2097 si no hay) y borra sus propios
 * datos al terminar.
 *
 * `AuthService` se reemplaza por lo mínimo que hace `registerUserTransaction` (crear la cuenta
 * dentro de la transacción recibida): lo que se prueba aquí es que cuenta, inscripción y llegada
 * se guardan juntas o no se guarda ninguna.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('HU-24: alta de jurado de último momento (BD real)', () => {
  const prisma = new PrismaService();
  const tag = randomUUID().slice(0, 8);
  const sentEmails: string[] = [];
  const auth = {
    registerUserTransaction: async (
      { email }: { email: string },
      tx: Prisma.TransactionClient,
    ) => {
      const { id: roleId } = await tx.role.findFirstOrThrow({
        where: { name: 'Estudiante' },
      });
      const user = await tx.user.create({
        data: { email, firstName: '', lastName: '', roleId, isActive: false },
      });
      return { user, verificationToken: `token-${tag}` };
    },
    sendVerificationEmail: (email: string) => {
      sentEmails.push(email);
      return Promise.resolve({ message: 'ok' });
    },
  };
  const service = new WalkInJurorService(
    prisma,
    auth as unknown as AuthService,
  );
  (service as any).logger = { error: jest.fn(), log: jest.fn() };

  const emailOf = (key: string) => `${key}-${tag}@hu24.test`;
  const lastName = `Prueba${tag.replace(/[0-9]/g, 'x')}`;
  let editionId = 0;
  let createdEdition = false;
  let adminId = '';

  const ownUsers = () =>
    prisma.user.findMany({
      where: { email: { endsWith: `-${tag}@hu24.test` } },
      select: { id: true },
    });

  beforeAll(async () => {
    await prisma.$connect();
    const active = await prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
    });
    if (active) {
      editionId = active.id;
    } else {
      const created = await prisma.edition.create({
        data: {
          year: 2097,
          semester: 30,
          title: `HU24 ${tag}`,
          status: EditionStatus.ACTIVE,
          startsAt: new Date('2097-11-26T13:00:00.000Z'),
          endsAt: new Date('2097-11-26T23:00:00.000Z'),
        },
      });
      editionId = created.id;
      createdEdition = true;
    }
    const { id: roleId } = await prisma.role.findFirstOrThrow({
      where: { name: 'Administrador' },
    });
    const admin = await prisma.user.create({
      data: {
        email: emailOf('admin'),
        firstName: 'Admin',
        lastName,
        roleId,
      },
      select: { id: true },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    const ids = (await ownUsers()).map((user) => user.id);
    // Datos de prueba propios en una base desechable: se borran de verdad para no dejar residuos.
    await prisma.jurorAttendance.deleteMany({
      where: { jurorId: { in: ids } },
    });
    await prisma.jurorEdition.deleteMany({ where: { jurorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    if (createdEdition) {
      await prisma.edition.delete({ where: { id: editionId } });
    }
    await prisma.$disconnect();
  });

  it('deja la cuenta, la inscripción con walkIn y la llegada; ya es jurado de la edición', async () => {
    const result = await service.create(
      { firstName: 'Laura', lastName, email: emailOf('Laura') },
      adminId,
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: result.juror.id },
      include: { role: true, jurorEditions: true, attendances: true },
    });
    expect(user).toMatchObject({
      email: emailOf('laura'),
      firstName: 'Laura',
      lastName,
      isActive: true,
      jurorCategory: 'JUNIOR',
      jurorType: 'BACKUP',
      role: { name: 'Jurado' },
    });
    expect(user.jurorEditions).toEqual([
      expect.objectContaining({
        editionId,
        status: JurorEditionStatus.CONFIRMED,
        type: 'BACKUP',
        walkIn: true,
        updatedById: adminId,
      }),
    ]);
    expect(user.attendances).toEqual([
      expect.objectContaining({
        editionId,
        method: 'MANUAL',
        checkedInById: adminId,
        badgeId: null,
        isActive: true,
      }),
    ]);
    expect(result.attendance.checkedInAt).toEqual(
      user.attendances[0].checkedInAt,
    );

    // La definición única de HU-25 lo reconoce: asignación, check-in y reportes ya lo ven.
    expect(
      await prisma.user.count({
        where: jurorsOfEdition(editionId, [user.id]),
      }),
    ).toBe(1);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(sentEmails).toEqual([emailOf('laura')]);
  });

  it('el mismo correo (con otras mayúsculas) responde 409 y no crea otra cuenta', async () => {
    const before = (await ownUsers()).length;

    const error = await service
      .create(
        {
          firstName: 'Otra',
          lastName: 'Persona',
          email: emailOf('LAURA'),
          confirmSimilar: true,
        },
        adminId,
      )
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'EMAIL_ALREADY_EXISTS',
      existing: {
        role: 'Jurado',
        isJurorOfEdition: true,
        editionStatus: 'CONFIRMED',
        checkedInAt: expect.any(Date),
      },
    });
    expect((await ownUsers()).length).toBe(before);
  });

  it('un nombre parecido (sin tildes ni mayúsculas) responde 409 hasta confirmar', async () => {
    const similar = {
      firstName: 'LAURA',
      lastName: lastName.toUpperCase(),
      email: emailOf('laura2'),
    };

    const error = await service.create(similar, adminId).catch((e) => e);
    expect(error.getResponse()).toMatchObject({
      code: 'SIMILAR_PEOPLE',
      matches: [expect.objectContaining({ name: `Laura ${lastName}` })],
    });
    expect(
      await prisma.user.count({ where: { email: emailOf('laura2') } }),
    ).toBe(0);

    await expect(
      service.create({ ...similar, confirmSimilar: true }, adminId),
    ).resolves.toMatchObject({ walkIn: true });
  });

  it('si falla la llegada no queda ni la cuenta ni la inscripción (no hay jurado a medias)', async () => {
    const before = (await ownUsers()).length;

    // Un administrador que no existe rompe la llave foránea de `registrado_por`, el último paso.
    const error = await service
      .create(
        { firstName: 'Mario', lastName: 'Incompleto', email: emailOf('mario') },
        randomUUID(),
      )
      .catch((e) => e);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(
      await prisma.user.count({ where: { email: emailOf('mario') } }),
    ).toBe(0);
    expect((await ownUsers()).length).toBe(before);
    expect(sentEmails).not.toContain(emailOf('mario'));
  });
});
