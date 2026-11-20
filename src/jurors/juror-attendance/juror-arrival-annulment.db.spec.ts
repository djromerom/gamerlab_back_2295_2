import { ConflictException } from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { JurorBadgesService } from 'src/jurors/juror-badges/juror-badges.service';
import { JurorCheckinService } from 'src/jurors/juror-checkin/juror-checkin.service';
import { JurorPresenceService } from 'src/jurors/juror-presence/juror-presence.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { JurorArrivalAnnulmentService } from './juror-arrival-annulment.service';
import { JurorAttendanceService } from './juror-attendance.service';

/**
 * Integración (BG-49): registrar → anular → el jurado vuelve a «Sin check-in» en asistencia y
 * presencia → se puede registrar de nuevo. Contra Postgres real: solo corre con RUN_DB_TESTS=1
 * sobre una base desechable con migraciones y seed. Usa la edición activa (o crea una de 2099 si
 * no hay) y borra sus propios datos al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('BG-49: anular la llegada de un jurado (BD real)', () => {
  const prisma = new PrismaService();
  // El registro manual no usa las escarapelas (solo el QR las valida).
  const checkin = new JurorCheckinService(prisma, {} as JurorBadgesService);
  const attendance = new JurorAttendanceService(prisma);
  const annulment = new JurorArrivalAnnulmentService(prisma);
  const presence = new JurorPresenceService(prisma);
  const tag = randomUUID().slice(0, 8);
  const ids = { active: 0, createdActive: false, users: [] as string[] };
  const user: Record<string, string> = {};

  const createUser = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@bg49.test`,
        firstName: key,
        lastName: `BG49${tag}`,
        roleId: roleRow.id,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    user[key] = created.id;
  };

  const rowOfJuror = async () => {
    const page = await attendance.list({
      search: `BG49${tag}`,
      page: 1,
      limit: 100,
    } as ListAttendanceQueryDto);
    return page.data.find((item) => item.jurorId === user.jurado);
  };

  beforeAll(async () => {
    await prisma.$connect();
    const active = await prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (active) ids.active = active.id;
    else {
      ids.active = (
        await prisma.edition.create({
          data: {
            year: 2099,
            semester: 10,
            title: `BG-49 ${tag}`,
            startsAt: new Date('2099-01-01T00:00:00Z'),
            endsAt: new Date('2099-01-02T00:00:00Z'),
            status: EditionStatus.ACTIVE,
          },
          select: { id: true },
        })
      ).id;
      ids.createdActive = true;
    }
    await createUser('jurado', 'Jurado');
    await createUser('mesa', 'Staff');
    await createUser('admin', 'Administrador');
    await prisma.jurorEdition.create({
      data: {
        jurorId: user.jurado,
        editionId: ids.active,
        status: 'CONFIRMED',
      },
    });
  });

  afterAll(async () => {
    // Datos propios de la prueba en una base desechable: se borran por id.
    await prisma.jurorAttendance.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.jurorEdition.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    if (ids.createdActive) {
      await prisma.edition.deleteMany({ where: { id: ids.active } });
    }
    await prisma.$disconnect();
  });

  it('registrar → anular → vuelve a Sin check-in → se registra de nuevo', async () => {
    // 1. La mesa registra la llegada por error.
    const first = await checkin.checkInManually(user.jurado, user.mesa);
    expect(first.status).toBe('CHECKED_IN');
    const present = await rowOfJuror();
    expect(present).toMatchObject({ status: 'PRESENT' });
    expect(present?.attendanceId).toEqual(expect.any(Number));
    const firstId = present!.attendanceId!;
    await presence.confirmMine(user.jurado);

    // 2. El Administrador la anula: queda registro de quién, cuándo y el motivo.
    const annulled = await annulment.annul(firstId, user.admin, 'QR vecino');
    expect(annulled).toMatchObject({
      attendanceId: firstId,
      juror: { id: user.jurado },
      checkedInBy: { id: user.mesa },
      annulledBy: { id: user.admin },
      annulmentReason: 'QR vecino',
      jurorStatus: 'MISSING',
    });
    const stored = await prisma.jurorAttendance.findUniqueOrThrow({
      where: { id: firstId },
    });
    expect(stored).toMatchObject({
      isActive: false,
      annulledById: user.admin,
      annulmentReason: 'QR vecino',
    });
    expect(stored.annulledAt).toBeInstanceOf(Date);

    // 3. Asistencia y presencia lo ven sin llegada; «Sigo aquí» responde 409.
    expect(await rowOfJuror()).toMatchObject({
      status: 'MISSING',
      attendanceId: null,
      checkedInAt: null,
    });
    expect(await presence.getMine(user.jurado)).toMatchObject({
      checkedIn: false,
      lastConfirmedAt: null,
    });
    await expect(presence.confirmMine(user.jurado)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const search = await checkin.search(`jurado BG49${tag}`);
    expect(search).toEqual([
      expect.objectContaining({ id: user.jurado, checkedInAt: null }),
    ]);

    // 4. Anular otra vez: 409.
    await expect(annulment.annul(firstId, user.admin)).rejects.toMatchObject({
      response: { code: 'ARRIVAL_ALREADY_ANNULLED' },
    });

    // 5. El índice único parcial (solo activas) deja registrar la llegada de nuevo.
    const second = await checkin.checkInManually(user.jurado, user.mesa);
    expect(second.status).toBe('CHECKED_IN');
    const again = await rowOfJuror();
    expect(again).toMatchObject({ status: 'PRESENT' });
    expect(again?.attendanceId).not.toBe(firstId);
    expect(
      await prisma.jurorAttendance.count({
        where: { jurorId: user.jurado, editionId: ids.active },
      }),
    ).toBe(2);
  });
});
