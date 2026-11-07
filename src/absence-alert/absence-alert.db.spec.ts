import { CheckInMethod, EditionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EvaluationTrackingService } from '../evaluation-tracking/evaluation-tracking.service';
import { JurorAttendanceService } from '../juror-attendance/juror-attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbsenceAlertService } from './absence-alert.service';
import { FairScheduleService } from './fair-schedule.service';

/**
 * Integración (HU-12): cronograma, alerta y panel contra Postgres real.
 * Solo corre con RUN_DB_TESTS=1 sobre una base desechable con migraciones y seed. Usa la edición
 * activa (o crea una de 2099 si no hay) y borra sus propios datos al terminar.
 */
const maybe = process.env.RUN_DB_TESTS === '1' ? describe : describe.skip;

maybe('HU-12: alerta de inasistencia (BD real)', () => {
  const prisma = new PrismaService();
  const schedules = new FairScheduleService(prisma);
  const service = new AbsenceAlertService(
    prisma,
    new JurorAttendanceService(prisma),
    new EvaluationTrackingService(prisma),
    schedules,
  );
  const tag = randomUUID().slice(0, 8);
  const ids = {
    active: 0,
    createdActive: false,
    hadSchedule: false,
    team: 0,
    users: [] as string[],
  };
  const user: Record<string, string> = {};
  const at = (time: string) => new Date(`2026-11-26T${time}:00.000-05:00`);

  const createUser = async (key: string, role: string) => {
    const roleRow = await prisma.role.findFirstOrThrow({
      where: { name: role },
    });
    const created = await prisma.user.create({
      data: {
        email: `${key}-${tag}@hu12.test`,
        firstName: key,
        lastName: `HU12${tag}`,
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
    if (active) ids.active = active.id;
    else {
      ids.active = (
        await prisma.edition.create({
          data: {
            year: 2099,
            semester: 10,
            title: `HU-12 ${tag}`,
            startsAt: new Date('2099-01-01T00:00:00Z'),
            endsAt: new Date('2099-01-02T00:00:00Z'),
            status: EditionStatus.ACTIVE,
          },
          select: { id: true },
        })
      ).id;
      ids.createdActive = true;
    }
    ids.hadSchedule =
      (await prisma.fairSchedule.count({
        where: { editionId: ids.active },
      })) > 0;

    await createUser('presente', 'Jurado');
    await createUser('falta', 'Jurado');
    await createUser('suplente', 'Jurado');
    await createUser('pendiente', 'Jurado');
    await createUser('mesa', 'Staff');
    await createUser('lider', 'Estudiante');
    await prisma.jurorEdition.createMany({
      data: [
        { jurorId: user.presente, editionId: ids.active, status: 'CONFIRMED' },
        { jurorId: user.falta, editionId: ids.active, status: 'CONFIRMED' },
        {
          jurorId: user.suplente,
          editionId: ids.active,
          status: 'CONFIRMED',
          type: 'BACKUP',
        },
        { jurorId: user.pendiente, editionId: ids.active, status: 'PENDING' },
      ],
    });
    await prisma.jurorAttendance.create({
      data: {
        jurorId: user.presente,
        editionId: ids.active,
        checkedInById: user.mesa,
        method: CheckInMethod.MANUAL,
      },
    });
    const status = await prisma.videogameStatus.findFirstOrThrow({
      select: { id: true },
    });
    ids.team = (
      await prisma.team.create({
        data: {
          teamName: `HU12 ${tag}`,
          teamCode: `N2-${tag}`.slice(0, 12),
          userId: user.lider,
          editionId: ids.active,
          assignedJurors: {
            connect: [user.presente, user.falta, user.pendiente].map((id) => ({
              id,
            })),
          },
          videogame: {
            create: { name: `J${tag}`, videogameStatusId: status.id },
          },
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    // Datos propios de la prueba en una base desechable: se borran por id.
    await prisma.videogame.deleteMany({ where: { teamId: ids.team } });
    await prisma.team.deleteMany({ where: { id: ids.team } });
    await prisma.jurorAttendance.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.jurorEdition.deleteMany({
      where: { jurorId: { in: ids.users } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    if (!ids.hadSchedule) {
      await prisma.fairSchedule.deleteMany({
        where: { editionId: ids.active },
      });
    }
    if (ids.createdActive) {
      await prisma.edition.deleteMany({ where: { id: ids.active } });
    }
    await prisma.$disconnect();
  });

  const ownJurors = <T extends { jurorId: string }>(jurors: T[]) =>
    jurors.filter((juror) => ids.users.includes(juror.jurorId));

  it('guarda el cronograma y lo reemplaza, sin correr la fecha por la zona horaria', async () => {
    const base = {
      editionId: ids.active,
      fairDate: '2026-11-26',
      startTime: '08:00',
      alertTime: '09:30',
      controlTime: '11:00',
      closeTime: '12:00',
    };
    await schedules.save(base, user.mesa);
    await schedules.save({ ...base, alertTime: '10:00' }, user.mesa);

    const saved = await schedules.get(ids.active);
    expect(saved.configured).toBe(true);
    expect(saved.schedule).toMatchObject({
      fairDate: '2026-11-26',
      alertTime: '10:00',
    });
    expect(
      await prisma.fairSchedule.count({ where: { editionId: ids.active } }),
    ).toBe(1);
  });

  it('a las 10:00 lista a los confirmados sin check-in; no al pendiente ni al presente', async () => {
    const alert = await service.getAlert(at('10:00'));

    expect(alert.phase).toBe('ALERT');
    expect(
      ownJurors(alert.missingJurors).map((j) => [j.jurorId, j.state, j.type]),
    ).toEqual([
      [user.falta, 'NO_CHECK_IN', 'OFFICIAL'],
      [user.suplente, 'NO_CHECK_IN', 'BACKUP'],
    ]);
    expect(alert.groups.find((g) => g.teamId === ids.team)).toMatchObject({
      assignedJurors: 2,
      presentJurors: 1,
      evaluationsCounted: 0,
      missingEvaluations: 3,
    });
  });

  it('a las 11:00 quedan ausentes y el panel los filtra', async () => {
    const absent = await service.listAbsentJurors(ids.active, at('11:00'));
    expect(ownJurors(absent).map((j) => j.state)).toEqual(['ABSENT', 'ABSENT']);

    const panel = await service.getPanel({ attendance: 'ABSENT' }, at('11:00'));
    const group = panel.data.find((g) => g.teamId === ids.team);
    expect(group?.jurors.map((j) => j.jurorId)).toEqual([user.falta]);
  });

  it('un check-in tardío saca al jurado de los ausentes', async () => {
    await prisma.jurorAttendance.create({
      data: {
        jurorId: user.falta,
        editionId: ids.active,
        checkedInById: user.mesa,
        method: CheckInMethod.QR,
      },
    });

    const absent = await service.listAbsentJurors(ids.active, at('11:30'));
    expect(ownJurors(absent).map((j) => j.jurorId)).toEqual([user.suplente]);
  });
});
