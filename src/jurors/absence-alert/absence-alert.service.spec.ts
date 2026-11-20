import { EditionStatus } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { REQUIRED_SERVICE_KEY } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { EvaluationTrackingService } from 'src/evaluation-tracking/evaluation-tracking.service';
import { JurorAttendanceService } from 'src/jurors/juror-attendance/juror-attendance.service';
import { AttendanceRow } from 'src/jurors/juror-attendance/juror-attendance.types';
import { PrismaService } from 'src/prisma/prisma.service';
import { AbsenceAlertController } from './absence-alert.controller';
import { AbsenceAlertService } from './absence-alert.service';
import { DEFAULT_FAIR_TIMES } from './fair-schedule';
import { FairScheduleService } from './fair-schedule.service';

const EDITION = {
  id: 5,
  title: 'ARKAD 2026-30',
  status: EditionStatus.ACTIVE,
  year: 2026,
  semester: 30,
  endsAt: new Date('2099-01-01T00:00:00.000Z'),
};
const SCHEDULE = { ...DEFAULT_FAIR_TIMES, fairDate: '2026-11-26' };
const at = (time: string) => new Date(`2026-11-26T${time}:00.000-05:00`);
const ARRIVAL = at('08:30');

const row = (
  jurorId: string,
  lastName: string,
  checkedInAt: Date | null,
  isProfessor = false,
): AttendanceRow => ({
  firstName: 'Nombre',
  lastName,
  item: {
    jurorId,
    attendanceId: checkedInAt ? 1 : null,
    name: `Nombre ${lastName}`,
    category: isProfessor ? 'Senior' : 'Junior',
    isProfessor,
    hasBadge: true,
    status: checkedInAt ? 'PRESENT' : 'MISSING',
    checkedInAt,
    method: checkedInAt ? 'QR' : null,
    checkedInBy: checkedInAt ? { id: 'staff-1', name: 'Mesa 1' } : null,
  },
});

const trackingGroup = (teamId: number, teamCode: string, counted: number) => ({
  teamId,
  teamCode,
  teamName: `Equipo ${teamId}`,
  videogame: `Juego ${teamId}`,
  level: 'N2',
  assignedJurors: 99,
  presentJurors: 99,
  evaluationsReceived: counted,
  evaluationsCounted: counted,
  byHour: [],
  belowMinimumAt11: counted < 3,
});

describe('AbsenceAlertService (HU-12)', () => {
  const prisma = {
    edition: { findFirst: jest.fn() },
    jurorEdition: { findMany: jest.fn() },
    team: { findMany: jest.fn() },
    evaluation: { findMany: jest.fn() },
    absentJurorResponse: { findMany: jest.fn() },
    jurorAttendance: { findMany: jest.fn() },
  };
  const attendance = { rowsOfEdition: jest.fn() };
  const tracking = { getTracking: jest.fn() };
  const schedules = { findForEdition: jest.fn() };
  let service: AbsenceAlertService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue(EDITION);
    prisma.absentJurorResponse.findMany.mockResolvedValue([]);
    prisma.jurorAttendance.findMany.mockResolvedValue([]);
    schedules.findForEdition.mockResolvedValue(SCHEDULE);
    attendance.rowsOfEdition.mockResolvedValue([
      row('present-1', 'Zapata', ARRIVAL),
      row('missing-2', 'Mora', null, true),
      row('missing-1', 'Gómez', null),
    ]);
    prisma.jurorEdition.findMany.mockResolvedValue([
      { jurorId: 'present-1', type: 'OFFICIAL' },
      { jurorId: 'missing-1', type: 'BACKUP' },
    ]);
    tracking.getTracking.mockResolvedValue({
      groups: [
        trackingGroup(1, 'N2-A', 0),
        trackingGroup(2, 'N2-B', 2),
        trackingGroup(3, 'N2-C', 3),
        trackingGroup(4, 'N1-D', 0),
      ],
    });
    prisma.team.findMany.mockResolvedValue([
      {
        id: 1,
        videogame: { id: 11 },
        assignedJurors: [
          { id: 'present-1' },
          { id: 'missing-1' },
          { id: 'otra-edicion' },
        ],
      },
      { id: 2, videogame: { id: 12 }, assignedJurors: [{ id: 'missing-2' }] },
      { id: 3, videogame: { id: 13 }, assignedJurors: [] },
      { id: 4, videogame: { id: 14 }, assignedJurors: [] },
    ]);
    prisma.evaluation.findMany.mockResolvedValue([
      { videogameId: 11, jurorId: 'present-1' },
      { videogameId: 12, jurorId: 'present-1' },
    ]);
    service = new AbsenceAlertService(
      prisma as unknown as PrismaService,
      attendance as unknown as JurorAttendanceService,
      tracking as unknown as EvaluationTrackingService,
      schedules as unknown as FairScheduleService,
    );
  });

  describe('getAlert', () => {
    it('antes de la hora de alerta solo entrega el contador', async () => {
      const alert = await service.getAlert(at('09:59'));

      expect(alert.phase).toBe('BEFORE_ALERT');
      expect(alert.alertActive).toBe(false);
      expect(alert.totals).toEqual({
        present: 1,
        missing: 2,
        notComing: 0,
        total: 3,
      });
      expect(alert.missingJurors).toEqual([]);
      expect(alert.groups).toEqual([]);
      expect(tracking.getTracking).not.toHaveBeenCalled();
    });

    it('sin cronograma no hay alerta', async () => {
      schedules.findForEdition.mockResolvedValue({
        ...DEFAULT_FAIR_TIMES,
        fairDate: null,
      });

      const alert = await service.getAlert(at('11:30'));

      expect(alert.phase).toBe('NOT_CONFIGURED');
      expect(alert.alertActive).toBe(false);
      expect(alert.missingJurors).toEqual([]);
    });

    it('a las 10:00 es informativa: faltantes por apellido, aún sin ausentes', async () => {
      const alert = await service.getAlert(at('10:00'));

      expect(alert.phase).toBe('ALERT');
      expect(alert.alertActive).toBe(true);
      expect(alert.missingJurors.map((j) => [j.jurorId, j.state])).toEqual([
        ['missing-1', 'NO_CHECK_IN'],
        ['missing-2', 'NO_CHECK_IN'],
      ]);
    });

    it('a las 11:00 es definitiva: quien no llegó queda ausente', async () => {
      const alert = await service.getAlert(at('11:00'));

      expect(alert.phase).toBe('CONTROL');
      expect(alert.missingJurors.map((j) => j.state)).toEqual([
        'ABSENT',
        'ABSENT',
      ]);
    });

    it('cuando un jurado hace check-in sale de la lista, aun después del control', async () => {
      attendance.rowsOfEdition.mockResolvedValue([
        row('present-1', 'Zapata', ARRIVAL),
        row('missing-1', 'Gómez', at('11:10')),
        row('missing-2', 'Mora', null, true),
      ]);

      const alert = await service.getAlert(at('11:15'));

      expect(alert.missingJurors.map((j) => j.jurorId)).toEqual(['missing-2']);
      expect(alert.totals.missing).toBe(1);
    });

    it('si todos llegaron pero hay grupos con faltantes, la alerta sigue activa', async () => {
      attendance.rowsOfEdition.mockResolvedValue([
        row('present-1', 'Zapata', ARRIVAL),
      ]);

      const alert = await service.getAlert(at('10:30'));

      expect(alert.alertActive).toBe(true);
      expect(alert.missingJurors).toEqual([]);
      expect(alert.totals.missing).toBe(0);
      expect(alert.groups.length).toBeGreaterThan(0);
    });

    it('si todos llegaron y ningún grupo tiene faltantes, la alerta no está activa', async () => {
      attendance.rowsOfEdition.mockResolvedValue([
        row('present-1', 'Zapata', ARRIVAL),
      ]);
      tracking.getTracking.mockResolvedValue({ groups: [] });

      const alert = await service.getAlert(at('10:30'));

      expect(alert.alertActive).toBe(false);
      expect(alert.groups).toEqual([]);
    });

    it('ordena los grupos de más a menos faltantes y omite los completos', async () => {
      const alert = await service.getAlert(at('10:00'));

      expect(
        alert.groups.map((g) => [g.teamCode, g.missingEvaluations]),
      ).toEqual([
        ['N1-D', 3],
        ['N2-A', 3],
        ['N2-B', 1],
      ]);
    });

    it('cuenta en el grupo solo a los jurados de la edición, y sus presentes', async () => {
      const alert = await service.getAlert(at('10:00'));

      const group = alert.groups.find((g) => g.teamId === 1);
      expect(group).toMatchObject({ assignedJurors: 2, presentJurors: 1 });
      expect(group).not.toHaveProperty('jurors');
    });

    it('no expone correos ni quién registró la llegada', async () => {
      const alert = await service.getAlert(at('10:00'));

      expect(Object.keys(alert.missingJurors[0]).sort()).toEqual([
        'category',
        'checkedInAt',
        'groups',
        'isProfessor',
        'jurorId',
        'name',
        'notComing',
        'notComingSince',
        'pendingGroups',
        'state',
        'type',
      ]);
    });

    it('cada jurado que falta trae sus grupos y cuántos le faltan por calificar (HU-44)', async () => {
      const alert = await service.getAlert(at('10:00'));

      expect(
        alert.missingJurors.map((j) => [j.jurorId, j.groups, j.pendingGroups]),
      ).toEqual([
        [
          'missing-1',
          [{ teamId: 1, teamCode: 'N2-A', level: 'N2', evaluated: false }],
          1,
        ],
        [
          'missing-2',
          [{ teamId: 2, teamCode: 'N2-B', level: 'N2', evaluated: false }],
          1,
        ],
      ]);
      expect(alert.notComingJurors).toEqual([]);
    });

    it('indica si es oficial o suplente; el profesor automático no tiene tipo', async () => {
      const alert = await service.getAlert(at('10:00'));

      expect(alert.missingJurors.map((j) => j.type)).toEqual(['BACKUP', null]);
    });
  });

  describe('«No podrá asistir» (HU-44)', () => {
    const response = (
      id: number,
      jurorId: string,
      result: 'ON_THE_WAY' | 'CANNOT_ATTEND' | 'NO_RESPONSE',
      recordedAt: Date,
    ) => ({ id, jurorId, result, recordedAt });

    beforeEach(() => {
      prisma.absentJurorResponse.findMany.mockResolvedValue([
        response(1, 'missing-1', 'CANNOT_ATTEND', at('09:30')),
      ]);
    });

    it('sale de «Faltan por llegar» y pasa a «No vendrán» con sus grupos, aun antes de la alerta', async () => {
      const alert = await service.getAlert(at('09:45'));

      expect(alert.totals).toEqual({
        present: 1,
        missing: 1,
        notComing: 1,
        total: 3,
      });
      expect(alert.missingJurors).toEqual([]);
      expect(alert.notComingJurors).toEqual([
        expect.objectContaining({
          jurorId: 'missing-1',
          state: 'ABSENT',
          notComing: true,
          notComingSince: at('09:30'),
          groups: [
            { teamId: 1, teamCode: 'N2-A', level: 'N2', evaluated: false },
          ],
          pendingGroups: 1,
        }),
      ]);
    });

    it('desde la alerta, «Faltan por llegar» solo tiene a los demás', async () => {
      const alert = await service.getAlert(at('10:00'));

      expect(alert.alertActive).toBe(true);
      expect(alert.missingJurors.map((j) => j.jurorId)).toEqual(['missing-2']);
      expect(alert.notComingJurors.map((j) => j.jurorId)).toEqual([
        'missing-1',
      ]);
    });

    it('una respuesta posterior «Viene en camino» o «Sin respuesta» lo devuelve a «Faltan por llegar»', async () => {
      for (const result of ['ON_THE_WAY', 'NO_RESPONSE'] as const) {
        prisma.absentJurorResponse.findMany.mockResolvedValue([
          response(1, 'missing-1', 'CANNOT_ATTEND', at('09:30')),
          response(2, 'missing-1', result, at('09:40')),
        ]);
        const alert = await service.getAlert(at('10:00'));
        expect(alert.notComingJurors).toEqual([]);
        expect(alert.missingJurors.map((j) => j.jurorId)).toEqual([
          'missing-1',
          'missing-2',
        ]);
      }
    });

    it('si al final llega y hace check-in, queda presente', async () => {
      attendance.rowsOfEdition.mockResolvedValue([
        row('present-1', 'Zapata', ARRIVAL),
        row('missing-2', 'Mora', null, true),
        row('missing-1', 'Gómez', at('10:15')),
      ]);
      prisma.jurorAttendance.findMany.mockResolvedValue([
        { jurorId: 'missing-1', checkedInAt: at('10:15'), isActive: true },
      ]);

      const alert = await service.getAlert(at('10:30'));

      expect(alert.totals.notComing).toBe(0);
      expect(alert.notComingJurors).toEqual([]);
      expect(alert.missingJurors.map((j) => j.jurorId)).toEqual(['missing-2']);
    });

    it('un check-in posterior anulado también deja la respuesta sin efecto', async () => {
      prisma.jurorAttendance.findMany.mockResolvedValue([
        { jurorId: 'missing-1', checkedInAt: at('10:15'), isActive: false },
      ]);

      const alert = await service.getAlert(at('10:30'));

      expect(alert.notComingJurors).toEqual([]);
      expect(alert.missingJurors.map((j) => j.jurorId)).toEqual([
        'missing-1',
        'missing-2',
      ]);
    });

    it('en el panel aparece como ausente antes de la hora de control', async () => {
      const panel = await service.getPanel(
        { attendance: 'ABSENT' },
        at('10:30'),
      );

      expect(panel.data.map((g) => g.teamId)).toEqual([1]);
      expect(panel.data[0].jurors).toEqual([
        expect.objectContaining({
          jurorId: 'missing-1',
          state: 'ABSENT',
          notComing: true,
          hasEvaluated: false,
        }),
      ]);
    });
  });

  describe('getPanel', () => {
    it('entrega cada grupo con el estado de sus jurados y si evaluaron', async () => {
      const panel = await service.getPanel({}, at('11:00'));

      expect(panel.data).toHaveLength(4);
      expect(
        panel.data[0].jurors.map((j) => [j.jurorId, j.state, j.hasEvaluated]),
      ).toEqual([
        ['present-1', 'PRESENT', true],
        ['missing-1', 'ABSENT', false],
      ]);
      expect(panel.totals).toEqual({
        present: 1,
        missing: 2,
        notComing: 0,
        total: 3,
      });
    });

    it('la evaluación de otro juego no cuenta como evaluado en este grupo', async () => {
      prisma.evaluation.findMany.mockResolvedValue([
        { videogameId: 12, jurorId: 'present-1' },
      ]);

      const panel = await service.getPanel({}, at('10:00'));

      expect(panel.data[0].jurors[0].hasEvaluated).toBe(false);
    });

    it('filtra por estado y quita los grupos que quedan vacíos', async () => {
      const panel = await service.getPanel(
        { attendance: 'ABSENT' },
        at('11:00'),
      );

      expect(
        panel.data.map((g) => [g.teamId, g.jurors.map((j) => j.jurorId)]),
      ).toEqual([
        [1, ['missing-1']],
        [2, ['missing-2']],
      ]);
      expect(panel.totals.total).toBe(3);
    });

    it('antes del control nadie está ausente', async () => {
      const panel = await service.getPanel(
        { attendance: 'ABSENT' },
        at('10:30'),
      );

      expect(panel.data).toEqual([]);
    });
  });

  describe('listAbsentJurors', () => {
    it('devuelve a los que no tienen check-in, en cualquier fase', async () => {
      const before = await service.listAbsentJurors(5, at('09:00'));
      const after = await service.listAbsentJurors(5, at('11:30'));

      expect(attendance.rowsOfEdition).toHaveBeenCalledWith(5);
      expect(schedules.findForEdition).toHaveBeenCalledWith(5);
      expect(before.map((j) => [j.jurorId, j.state])).toEqual([
        ['missing-1', 'NO_CHECK_IN'],
        ['missing-2', 'NO_CHECK_IN'],
      ]);
      expect(after.map((j) => j.state)).toEqual(['ABSENT', 'ABSENT']);
    });
  });
});

describe('AbsenceAlertController (permisos)', () => {
  const proto = AbsenceAlertController.prototype;
  const serviceOf = (handler: keyof AbsenceAlertController) =>
    Reflect.getMetadata(REQUIRED_SERVICE_KEY, proto[handler]) as string;

  it('todo el controlador pasa por RolePermissionGuard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AbsenceAlertController),
    ).toEqual([RolePermissionGuard]);
  });

  it('leer es ViewAbsenceAlert; el cronograma es ManageFairSchedule', () => {
    expect(serviceOf('getAlert')).toBe('ViewAbsenceAlert');
    expect(serviceOf('getPanel')).toBe('ViewAbsenceAlert');
    expect(serviceOf('getSchedule')).toBe('ManageFairSchedule');
    expect(serviceOf('saveSchedule')).toBe('ManageFairSchedule');
  });
});
