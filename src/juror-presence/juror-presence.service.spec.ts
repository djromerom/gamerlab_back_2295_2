import { ConflictException, NotFoundException } from '@nestjs/common';
import { REQUIRED_SERVICE_KEY } from '../auth/decorators/required-service.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JurorPresenceController } from './juror-presence.controller';
import {
  JUROR_NOT_CHECKED_IN,
  JurorPresenceService,
} from './juror-presence.service';

const EDITION = { id: 5, title: 'ARKAD 2026-30' };
const ARRIVAL = new Date('2026-11-26T13:00:00.000Z');
const at = (minutes: number) => new Date(ARRIVAL.getTime() + minutes * 60_000);

const config = (extra: Record<string, unknown> = {}) => ({
  evaluationsOpen: true,
  presencePromptMinutes: 60,
  presenceResponseMinutes: 15,
  inactivityMinutes: 45,
  ...extra,
});

const juror = (
  id: string,
  firstName: string,
  attendance: { checkedInAt: Date; lastPresenceConfirmedAt: Date | null },
  role = 'Jurado',
) => ({
  id,
  firstName,
  lastName: 'Prueba',
  jurorCategory: role === 'Jurado' ? 'JUNIOR' : null,
  role: { name: role },
  attendances: [attendance],
});

describe('JurorPresenceService (HU-23)', () => {
  const prisma = {
    edition: { findFirst: jest.fn() },
    eventConfiguration: { findUnique: jest.fn(), upsert: jest.fn() },
    jurorAttendance: { findFirst: jest.fn(), updateMany: jest.fn() },
    user: { findMany: jest.fn() },
    evaluation: { groupBy: jest.fn() },
  };
  const service = new JurorPresenceService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.edition.findFirst.mockResolvedValue(EDITION);
    prisma.eventConfiguration.findUnique.mockResolvedValue(config());
    prisma.evaluation.groupBy.mockResolvedValue([]);
  });

  describe('getMine', () => {
    it('sin llegada registrada: nunca pregunta', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue(null);
      const result = await service.getMine('j1', at(500));
      expect(result).toMatchObject({
        checkedIn: false,
        promptDue: false,
        nextPromptAt: null,
      });
    });

    it('pregunta a los 60 minutos de la llegada', async () => {
      prisma.jurorAttendance.findFirst.mockResolvedValue({
        checkedInAt: ARRIVAL,
        lastPresenceConfirmedAt: null,
      });
      const result = await service.getMine('j1', at(61));
      expect(result).toMatchObject({
        checkedIn: true,
        promptDue: true,
        nextPromptAt: at(60),
        serverTime: at(61),
      });
      expect(prisma.jurorAttendance.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jurorId: 'j1', editionId: EDITION.id, isActive: true },
        }),
      );
    });

    it('con las evaluaciones cerradas no pregunta', async () => {
      prisma.eventConfiguration.findUnique.mockResolvedValue(
        config({ evaluationsOpen: false }),
      );
      prisma.jurorAttendance.findFirst.mockResolvedValue({
        checkedInAt: ARRIVAL,
        lastPresenceConfirmedAt: null,
      });
      const result = await service.getMine('j1', at(90));
      expect(result.promptDue).toBe(false);
    });

    it('sin configuración del evento usa los valores por defecto (y no pregunta)', async () => {
      prisma.eventConfiguration.findUnique.mockResolvedValue(null);
      prisma.jurorAttendance.findFirst.mockResolvedValue(null);
      const result = await service.getMine('j1', at(0));
      expect(result.settings).toEqual({
        promptEveryMinutes: 60,
        responseWindowMinutes: 15,
        inactivityMinutes: 45,
      });
      expect(result.evaluationsOpen).toBe(false);
    });

    it('sin edición activa: 404', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);
      await expect(service.getMine('j1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('confirmMine', () => {
    it('guarda la hora del servidor y reinicia la pregunta', async () => {
      prisma.jurorAttendance.updateMany.mockResolvedValue({ count: 1 });
      prisma.jurorAttendance.findFirst.mockResolvedValue({
        checkedInAt: ARRIVAL,
        lastPresenceConfirmedAt: at(65),
      });
      const result = await service.confirmMine('j1', at(65));
      expect(prisma.jurorAttendance.updateMany).toHaveBeenCalledWith({
        where: { jurorId: 'j1', editionId: EDITION.id, isActive: true },
        data: { lastPresenceConfirmedAt: at(65) },
      });
      expect(result).toMatchObject({
        promptDue: false,
        nextPromptAt: at(125),
      });
    });

    it('sin llegada registrada: 409 JUROR_NOT_CHECKED_IN', async () => {
      prisma.jurorAttendance.updateMany.mockResolvedValue({ count: 0 });
      const error: unknown = await service
        .confirmMine('j1')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: JUROR_NOT_CHECKED_IN,
      });
    });
  });

  describe('list', () => {
    const ana = juror('ana', 'Ana', {
      checkedInAt: ARRIVAL,
      lastPresenceConfirmedAt: at(62),
    });
    const beto = juror('beto', 'Beto', {
      checkedInAt: ARRIVAL,
      lastPresenceConfirmedAt: null,
    });
    const carla = juror(
      'carla',
      'Carla',
      { checkedInAt: at(30), lastPresenceConfirmedAt: null },
      'Profesor',
    );

    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([ana, beto, carla]);
      prisma.evaluation.groupBy.mockResolvedValue([
        { jurorId: 'ana', _max: { date: at(70) } },
        { jurorId: 'carla', _max: { date: at(80) } },
      ]);
    });

    it('calcula los indicadores, los totales y ordena primero a quien tiene alertas', async () => {
      const result = await service.list({}, at(100));
      expect(result.totals).toEqual({
        checkedIn: 3,
        presenceUnconfirmed: 1,
        possibleLeft: 1,
        withAnyIndicator: 1,
      });
      expect(result.data.map((r) => [r.jurorId, r.indicators])).toEqual([
        ['beto', ['PRESENCE_UNCONFIRMED', 'POSSIBLE_LEFT']],
        ['ana', []],
        ['carla', []],
      ]);
      const carlaRow = result.data.find((r) => r.jurorId === 'carla')!;
      expect(carlaRow).toMatchObject({
        isProfessor: true,
        category: 'Senior',
        lastActivityAt: at(80),
      });
      expect(carlaRow).not.toHaveProperty('email');
    });

    it('solo consulta jurados de la edición con llegada activa', async () => {
      await service.list({}, at(100));
      const [args] = prisma.user.findMany.mock.calls[0] as [
        { where: { attendances: unknown } },
      ];
      expect(args.where.attendances).toEqual({
        some: { editionId: EDITION.id, isActive: true },
      });
      expect(prisma.evaluation.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            editionId: EDITION.id,
            jurorId: { in: ['ana', 'beto', 'carla'] },
          },
        }),
      );
    });

    it('no muestra como actividad una evaluación anterior a la llegada', async () => {
      prisma.evaluation.groupBy.mockResolvedValue([
        { jurorId: 'carla', _max: { date: at(10) } },
      ]);
      const result = await service.list({}, at(50));
      const carlaRow = result.data.find((r) => r.jurorId === 'carla')!;
      expect(carlaRow.lastActivityAt).toBeNull();
      expect(carlaRow.indicators).toEqual([]);
    });

    it('filtra por indicador', async () => {
      const result = await service.list(
        { indicator: 'POSSIBLE_LEFT' },
        at(100),
      );
      expect(result.data.map((r) => r.jurorId)).toEqual(['beto']);
      const any = await service.list({ indicator: 'ANY' }, at(100));
      expect(any.data.map((r) => r.jurorId)).toEqual(['beto']);
    });

    it('con las evaluaciones cerradas no marca a nadie', async () => {
      prisma.eventConfiguration.findUnique.mockResolvedValue(
        config({ evaluationsOpen: false }),
      );
      const result = await service.list({}, at(300));
      expect(result.totals.withAnyIndicator).toBe(0);
      expect(result.data.every((r) => r.indicators.length === 0)).toBe(true);
    });

    it('sin jurados que hayan llegado no consulta evaluaciones', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      const result = await service.list({}, at(100));
      expect(result.data).toEqual([]);
      expect(prisma.evaluation.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    it('cambia solo lo enviado en la configuración de la edición activa', async () => {
      prisma.eventConfiguration.upsert.mockResolvedValue(
        config({ presenceResponseMinutes: 10 }),
      );
      const result = await service.updateSettings({
        responseWindowMinutes: 10,
      });
      expect(prisma.eventConfiguration.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { editionId: EDITION.id },
          update: { presenceResponseMinutes: 10 },
          create: { editionId: EDITION.id, presenceResponseMinutes: 10 },
        }),
      );
      expect(result.settings.responseWindowMinutes).toBe(10);
    });
  });
});

describe('JurorPresenceController: servicio requerido por ruta (HU-23)', () => {
  const service = (handler: keyof JurorPresenceController): unknown =>
    Reflect.getMetadata(
      REQUIRED_SERVICE_KEY,
      JurorPresenceController.prototype[handler],
    );

  it.each([
    ['getMine', 'ConfirmJurorPresence'],
    ['confirmMine', 'ConfirmJurorPresence'],
    ['list', 'ManageJurorPresence'],
    ['getSettings', 'ManageJurorPresence'],
    ['updateSettings', 'ManageJurorPresence'],
  ] as const)('%s exige %s', (handler, expected) => {
    expect(service(handler)).toBe(expected);
  });
});
