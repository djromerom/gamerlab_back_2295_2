import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { jurorsOfEdition } from '../juror-edition/jurors-of-edition';
import {
  ARRIVAL_REMINDER_NOTICE,
  PENDING_EVALUATIONS_NOTICE,
} from './push-messages';
import { PushNoticesService } from './push-notices.service';

const edition = { id: 5, title: 'ARKAD 2026-30' };
const notice = { title: 'Aviso', body: 'Mensaje' };

describe('PushNoticesService (HU-37)', () => {
  let prisma: {
    edition: { findFirst: jest.Mock };
    user: { findMany: jest.Mock };
  };
  let sender: { isEnabled: jest.Mock; sendToUsers: jest.Mock };
  let pendingGames: { getPendingVideogamesCount: jest.Mock };
  let service: PushNoticesService;
  let log: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      edition: { findFirst: jest.fn().mockResolvedValue(edition) },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
      },
    };
    sender = {
      isEnabled: jest.fn().mockReturnValue(true),
      sendToUsers: jest.fn().mockResolvedValue({
        enabled: true,
        totals: { devices: 1, sent: 1, expired: 0, failed: 0 },
        results: [
          { userId: 'u1', devices: 1, sent: 1, expired: 0, failed: 0 },
          { userId: 'u2', devices: 0, sent: 0, expired: 0, failed: 0 },
        ],
      }),
    };
    pendingGames = { getPendingVideogamesCount: jest.fn() };
    service = new PushNoticesService(
      prisma as any,
      sender as any,
      pendingGames as any,
    );
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('sendToEditionJurors', () => {
    it('avisa a los jurados de la edición activa y responde por jurado', async () => {
      const result = await service.sendToEditionJurors(notice, 'admin');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: jurorsOfEdition(edition.id),
        select: { id: true },
      });
      expect(sender.sendToUsers).toHaveBeenCalledWith(
        ['u1', 'u2'],
        expect.objectContaining(notice),
      );
      expect(result).toEqual({
        edition,
        totals: { jurors: 2, devices: 1, sent: 1, expired: 0, failed: 0 },
        results: [
          { jurorId: 'u1', devices: 1, sent: 1, expired: 0, failed: 0 },
          { jurorId: 'u2', devices: 0, sent: 0, expired: 0, failed: 0 },
        ],
      });
    });

    it('con datos sensibles responde 400 antes de buscar a los jurados', async () => {
      await expect(
        service.sendToEditionJurors(
          { title: 'Aviso', body: 'Escribe a a@b.co' },
          'admin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('el registro no guarda el texto del aviso', async () => {
      await service.sendToEditionJurors(
        { title: 'Titulo-unico', body: 'Mensaje-unico' },
        'admin',
      );

      const logged = JSON.stringify(log.mock.calls);
      expect(logged).not.toContain('Titulo-unico');
      expect(logged).not.toContain('Mensaje-unico');
    });
  });

  describe('sendArrivalReminder', () => {
    it('solo busca jurados de la edición sin llegada activa en esa edición', async () => {
      await service.sendArrivalReminder('admin');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          ...jurorsOfEdition(edition.id),
          attendances: { none: { editionId: edition.id, isActive: true } },
        },
        select: { id: true },
      });
      expect(sender.sendToUsers).toHaveBeenCalledWith(
        ['u1', 'u2'],
        ARRIVAL_REMINDER_NOTICE,
      );
    });
  });

  describe('sendPendingEvaluations', () => {
    it('solo avisa a quienes tienen pendientes, con el conteo existente', async () => {
      pendingGames.getPendingVideogamesCount.mockImplementation((id: string) =>
        Promise.resolve(id === 'u1' ? 2 : 0),
      );

      const result = await service.sendPendingEvaluations('admin');

      expect(sender.sendToUsers).toHaveBeenCalledWith(
        ['u1'],
        PENDING_EVALUATIONS_NOTICE,
      );
      expect(result.totals.jurors).toBe(1);
    });

    it('revisa a todos los jurados aunque superen un lote', async () => {
      prisma.user.findMany.mockResolvedValue(
        Array.from({ length: 60 }, (_, i) => ({ id: `u${i}` })),
      );
      pendingGames.getPendingVideogamesCount.mockResolvedValue(1);

      const result = await service.sendPendingEvaluations('admin');

      expect(pendingGames.getPendingVideogamesCount).toHaveBeenCalledTimes(60);
      expect(result.totals.jurors).toBe(60);
    });

    it('con las evaluaciones cerradas no envía nada', async () => {
      pendingGames.getPendingVideogamesCount.mockRejectedValue(
        new ForbiddenException('cerradas'),
      );

      await expect(
        service.sendPendingEvaluations('admin'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(sender.sendToUsers).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ['sendToEditionJurors', () => service.sendToEditionJurors(notice, 'admin')],
    ['sendArrivalReminder', () => service.sendArrivalReminder('admin')],
    ['sendPendingEvaluations', () => service.sendPendingEvaluations('admin')],
  ])('%s, condiciones comunes', (_name, run) => {
    it('sin claves VAPID responde 503: no finge que el aviso salió', async () => {
      sender.isEnabled.mockReturnValue(false);

      await expect(run()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(sender.sendToUsers).not.toHaveBeenCalled();
    });

    it('sin edición activa responde 404', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
      expect(sender.sendToUsers).not.toHaveBeenCalled();
    });
  });
});
