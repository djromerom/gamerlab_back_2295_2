import { Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  EditionStatus,
  JurorEditionStatus,
  JurorType,
  SubstituteNoticeEmailStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SubstituteNoticesService } from './substitute-notices.service';

/**
 * Integración (HU-22, ARK-84): aviso al suplente contra Postgres real (tablas nuevas, foto de los
 * grupos, lectura por dueño y estado del correo). Solo corre con RUN_DB_TESTS=1 sobre una base
 * desechable con migraciones y seed. Usa la edición activa (o crea una de 2099) y borra sus propios
 * datos al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('HU-22: aviso al suplente (BD real)', () => {
  const prisma = new PrismaService();
  const email = {
    sendEmail: jest.fn().mockResolvedValue(undefined),
    isConfigured: jest.fn().mockReturnValue(true),
  };
  const service = new SubstituteNoticesService(
    prisma,
    email as any,
    { get: (_key: string, fallback: unknown) => fallback } as any,
  );
  const tag = randomUUID().slice(0, 6);
  const ids = {
    edition: 0,
    createdEdition: false,
    users: [] as string[],
    teams: [] as number[],
  };
  const user: Record<string, string> = {};
  const team: Record<string, number> = {};
  let noticeId = 0;

  const createUser = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({ where: { name: role } });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu22.test`,
        firstName: key,
        lastName: `HU22${tag}`,
        roleId: roleRow.id,
      },
      select: { id: true },
    });
    ids.users.push(created.id);
    user[key] = created.id;
  };

  const createTeam = async (key: string, code: string, withGame: boolean) => {
    await createUser(`lider${key}`, 'Estudiante');
    const created = await prisma.team.create({
      data: {
        teamName: `hu22-${tag}-${key}`,
        userId: user[`lider${key}`],
        editionId: ids.edition,
        teamCode: `${code}-${tag.slice(-4)}`,
        ...(withGame && {
          videogame: { create: { name: `hu22-${key}-${tag}` } },
        }),
      },
      select: { id: true },
    });
    ids.teams.push(created.id);
    team[key] = created.id;
  };

  const record = (jurorId: string, teamIds: number[]) =>
    prisma.$transaction((tx) =>
      service.recordAssignment(tx, { jurorId, teamIds, editionId: ids.edition }),
    );

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
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
            semester: 20,
            title: `HU-22 ${tag}`,
            startsAt: new Date('2099-01-01T00:00:00Z'),
            endsAt: new Date('2099-01-02T00:00:00Z'),
            status: EditionStatus.ACTIVE,
          },
          select: { id: true },
        })
      ).id;
      ids.createdEdition = true;
    }

    await createUser('suplente', 'Jurado');
    await createUser('oficial', 'Jurado');
    await createUser('profesor', 'Profesor');
    await prisma.jurorEdition.createMany({
      data: [
        { jurorId: user.suplente, type: JurorType.BACKUP },
        { jurorId: user.oficial, type: JurorType.OFFICIAL },
      ].map((row) => ({
        ...row,
        editionId: ids.edition,
        status: JurorEditionStatus.CONFIRMED,
      })),
    });
    await createTeam('A', 'N2-HUA', true);
    await createTeam('B', 'N0-HUB', false);
  });

  afterAll(async () => {
    await prisma.substituteNotice.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.videogame.deleteMany({ where: { teamId: { in: ids.teams } } });
    await prisma.team.deleteMany({ where: { id: { in: ids.teams } } });
    await prisma.jurorEdition.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    if (ids.createdEdition) {
      await prisma.edition.deleteMany({ where: { id: ids.edition } });
    }
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  it('una operación con dos grupos crea UN aviso con la foto y el nivel de cada grupo', async () => {
    noticeId = (await record(user.suplente, [team.A, team.B])) as number;
    expect(noticeId).toEqual(expect.any(Number));

    const rows = await prisma.substituteNoticeTeam.findMany({
      where: { noticeId },
      orderBy: { level: 'asc' },
    });
    expect(rows.map((r) => [r.teamId, r.level, r.videogameName])).toEqual([
      [team.B, 0, null],
      [team.A, 2, `hu22-A-${tag}`],
    ]);
    expect(
      await prisma.substituteNotice.count({ where: { jurorId: user.suplente } }),
    ).toBe(1);
  });

  it('el oficial y el profesor no generan aviso', async () => {
    expect(await record(user.oficial, [team.A])).toBeNull();
    expect(await record(user.profesor, [team.A])).toBeNull();
    expect(
      await prisma.substituteNotice.count({
        where: { jurorId: { in: [user.oficial, user.profesor] } },
      }),
    ).toBe(0);
  });

  it('el aviso conserva los datos del grupo aunque el equipo cambie', async () => {
    await prisma.team.update({
      where: { id: team.A },
      data: { teamName: `hu22-${tag}-A2` },
    });

    const mine = await service.findMine(user.suplente);
    expect(mine.unreadCount).toBe(1);
    expect(mine.data).toHaveLength(1);
    expect(mine.data[0]).toMatchObject({
      id: noticeId,
      readAt: null,
      message: 'Te asignaron grupos',
    });
    expect(mine.data[0].teams.map((t) => [t.teamName, t.levelLabel])).toEqual([
      [`hu22-${tag}-B`, 'Colegios'],
      [`hu22-${tag}-A`, 'Nivel 2'],
    ]);
  });

  it('si el correo falla queda FAILED con el motivo y el aviso sigue sin leer', async () => {
    email.sendEmail.mockRejectedValueOnce(
      new ServiceUnavailableException('Fallo en ACS: Unauthorized'),
    );

    await expect(service.sendNoticeEmail(noticeId)).resolves.toBe(
      SubstituteNoticeEmailStatus.FAILED,
    );
    const row = await prisma.substituteNotice.findUniqueOrThrow({
      where: { id: noticeId },
    });
    expect(row.emailStatus).toBe(SubstituteNoticeEmailStatus.FAILED);
    expect(row.emailError).toContain('Fallo en ACS');
    expect(row.readAt).toBeNull();

    const panel = await service.listUnread();
    expect(panel.data.filter((n) => n.jurorId === user.suplente)).toEqual([
      expect.objectContaining({
        noticeId,
        teamCount: 2,
        emailStatus: SubstituteNoticeEmailStatus.FAILED,
      }),
    ]);
  });

  it('solo el dueño lo marca como leído, una sola vez', async () => {
    await expect(service.markRead(user.oficial, noticeId)).rejects.toMatchObject({
      status: 404,
    });

    const first = await service.markRead(user.suplente, noticeId);
    expect(first.readAt).toBeInstanceOf(Date);
    const again = await service.markRead(
      user.suplente,
      noticeId,
      new Date('2099-12-31T00:00:00Z'),
    );
    expect(again.readAt).toEqual(first.readAt);

    expect((await service.findMine(user.suplente)).data).toEqual([]);
    const all = await service.findMine(user.suplente, 'all');
    expect(all.unreadCount).toBe(0);
    expect(all.data.map((n) => n.id)).toEqual([noticeId]);
    const panel = await service.listUnread();
    expect(panel.data.some((n) => n.jurorId === user.suplente)).toBe(false);
  });
});
