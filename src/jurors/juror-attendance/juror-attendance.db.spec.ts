import { CheckInMethod, EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { JurorAttendanceService } from './juror-attendance.service';

/**
 * Integración (HU-29): asistencia de los jurados de la edición activa contra Postgres real.
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Usa la
 * edición activa (o crea una de 2099 si no hay) y borra sus propios datos al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('HU-29: asistencia de los jurados de la edición (BD real)', () => {
  const prisma = new PrismaService();
  const service = new JurorAttendanceService(prisma);
  const tag = randomUUID().slice(0, 8);
  const ids = { active: 0, createdActive: false, users: [] as string[] };
  const user: Record<string, string> = {};

  const createUser = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu29.test`,
        firstName: key,
        lastName: `HU29${tag}`,
        roleId: roleRow.id,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    user[key] = created.id;
  };

  const query = (extra: Partial<ListAttendanceQueryDto> = {}) =>
    ({
      search: `HU29${tag}`,
      page: 1,
      limit: 100,
      ...extra,
    }) as ListAttendanceQueryDto;

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
            title: `HU-29 ${tag}`,
            startsAt: new Date('2099-01-01T00:00:00Z'),
            endsAt: new Date('2099-01-02T00:00:00Z'),
            status: EditionStatus.ACTIVE,
          },
          select: { id: true },
        })
      ).id;
      ids.createdActive = true;
    }
    await createUser('presente', 'Jurado');
    await createUser('falta', 'Jurado');
    await createUser('pendiente', 'Jurado');
    await createUser('mesa', 'Staff');
    await prisma.jurorEdition.createMany({
      data: [
        { jurorId: user.presente, editionId: ids.active, status: 'CONFIRMED' },
        { jurorId: user.falta, editionId: ids.active, status: 'CONFIRMED' },
        { jurorId: user.pendiente, editionId: ids.active, status: 'PENDING' },
      ],
    });
    // Una llegada del jurado confirmado y otra (vieja) de alguien que ya no es de la edición.
    await prisma.jurorAttendance.createMany({
      data: [user.presente, user.pendiente].map((jurorId) => ({
        jurorId,
        editionId: ids.active,
        checkedInById: user.mesa,
        method: CheckInMethod.MANUAL,
      })),
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

  it('muestra al presente con quién lo registró y al que falta; no al pendiente', async () => {
    const result = await service.list(query());

    expect(result.data.map((i) => [i.jurorId, i.status])).toEqual([
      [user.falta, 'MISSING'],
      [user.presente, 'PRESENT'],
    ]);
    expect(result.data[1]).toMatchObject({
      method: 'MANUAL',
      checkedInBy: { id: user.mesa, name: `mesa HU29${tag}` },
    });
    expect(result.totals).toEqual({ present: 1, missing: 1, total: 2 });
  });

  it('filtra por estado sin cambiar los totales', async () => {
    const result = await service.list(query({ status: 'MISSING' }));
    expect(result.data.map((i) => i.jurorId)).toEqual([user.falta]);
    expect(result.totals.total).toBe(2);
  });
});
