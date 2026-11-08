import { CheckInMethod, EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JurorPresenceService } from './juror-presence.service';

/**
 * Integración (HU-23): presencia de los jurados contra Postgres real (columnas nuevas, upsert de
 * parámetros y última evaluación). Solo corre con RUN_DB_TESTS=1 sobre una base desechable con
 * migraciones y seed. Usa la edición activa (o crea una de 2099), deja la configuración del evento
 * como estaba y borra sus propios datos al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('HU-23: presencia del jurado (BD real)', () => {
  const prisma = new PrismaService();
  const service = new JurorPresenceService(prisma);
  const tag = randomUUID().slice(0, 8);
  const ids = {
    edition: 0,
    createdEdition: false,
    users: [] as string[],
    evaluation: 0,
    config: null as null | Record<string, unknown>,
  };
  const user: Record<string, string> = {};
  const now = new Date();
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  const createUser = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu23.test`,
        firstName: key,
        lastName: `HU23${tag}`,
        roleId: roleRow.id,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    user[key] = created.id;
  };

  beforeAll(async () => {
    await prisma.$connect();
    const active = await prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (active) ids.edition = active.id;
    else {
      ids.edition = (
        await prisma.edition.create({
          data: {
            year: 2099,
            semester: 10,
            title: `HU-23 ${tag}`,
            startsAt: new Date('2099-01-01T00:00:00Z'),
            endsAt: new Date('2099-01-02T00:00:00Z'),
            status: EditionStatus.ACTIVE,
          },
          select: { id: true },
        })
      ).id;
      ids.createdEdition = true;
    }
    ids.config = await prisma.eventConfiguration.findUnique({
      where: { editionId: ids.edition },
    });
    await prisma.eventConfiguration.upsert({
      where: { editionId: ids.edition },
      update: { evaluationsOpen: true },
      create: { editionId: ids.edition, evaluationsOpen: true },
    });

    await createUser('activo', 'Jurado');
    await createUser('ausente', 'Jurado');
    await createUser('sinllegada', 'Jurado');
    await createUser('mesa', 'Staff');
    await prisma.jurorEdition.createMany({
      data: ['activo', 'ausente', 'sinllegada'].map((k) => ({
        jurorId: user[k],
        editionId: ids.edition,
        status: 'CONFIRMED' as const,
      })),
    });
    // Llegaron hace 2 horas. "activo" calificó hace 10 minutos; "ausente" nada desde que llegó.
    await prisma.jurorAttendance.createMany({
      data: ['activo', 'ausente'].map((k) => ({
        jurorId: user[k],
        editionId: ids.edition,
        checkedInAt: minutesAgo(120),
        checkedInById: user.mesa,
        method: CheckInMethod.MANUAL,
      })),
    });
    const videogame = await prisma.videogame.findFirstOrThrow({
      select: { id: true },
    });
    ids.evaluation = (
      await prisma.evaluation.create({
        data: {
          jurorId: user.activo,
          videogameId: videogame.id,
          editionId: ids.edition,
          date: minutesAgo(10),
          totalScore: 4,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.evaluation.deleteMany({ where: { id: ids.evaluation } });
    await prisma.jurorAttendance.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.jurorEdition.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    if (ids.config) {
      const { id, editionId, createdAt, updatedAt, ...previous } = ids.config;
      void id;
      void createdAt;
      void updatedAt;
      await prisma.eventConfiguration.update({
        where: { editionId: editionId as number },
        data: previous,
      });
    } else {
      await prisma.eventConfiguration.deleteMany({
        where: { editionId: ids.edition },
      });
    }
    if (ids.createdEdition) {
      await prisma.edition.deleteMany({ where: { id: ids.edition } });
    }
    await prisma.$disconnect();
  });

  const mine = <T extends { jurorId: string }>(rows: T[]) =>
    rows.filter((r) => ids.users.includes(r.jurorId));

  it('"Sigo aquí" guarda la hora y aplaza la siguiente pregunta', async () => {
    const before = await service.getMine(user.activo, now);
    expect(before.promptDue).toBe(true);

    const after = await service.confirmMine(user.activo, now);
    expect(after.promptDue).toBe(false);
    expect(after.lastConfirmedAt).toEqual(now);
    const row = await prisma.jurorAttendance.findFirstOrThrow({
      where: { jurorId: user.activo, editionId: ids.edition, isActive: true },
    });
    expect(row.lastPresenceConfirmedAt).toEqual(now);
  });

  it('sin llegada registrada: 409 y no pregunta', async () => {
    await expect(
      service.confirmMine(user.sinllegada, now),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect((await service.getMine(user.sinllegada, now)).checkedIn).toBe(false);
  });

  it('el panel marca al ausente con los dos indicadores y no al que califica', async () => {
    const result = await service.list({}, now);
    const rows = mine(result.data);
    expect(rows.map((r) => [r.jurorId, r.indicators])).toEqual([
      [user.ausente, ['PRESENCE_UNCONFIRMED', 'POSSIBLE_LEFT']],
      [user.activo, []],
    ]);
    expect(rows[1].lastActivityAt).toEqual(minutesAgo(10));
  });

  it('los parámetros se guardan por edición y cambian el cálculo', async () => {
    const updated = await service.updateSettings({ inactivityMinutes: 240 });
    expect(updated.settings.inactivityMinutes).toBe(240);
    expect((await service.getSettings()).settings).toMatchObject({
      promptEveryMinutes: 60,
      inactivityMinutes: 240,
    });
    const rows = mine((await service.list({}, now)).data);
    expect(rows.find((r) => r.jurorId === user.ausente)?.indicators).toEqual([
      'PRESENCE_UNCONFIRMED',
    ]);
  });
});
