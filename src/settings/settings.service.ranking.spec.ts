import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * ARK-SP1: sin configuración de edición activa (periodo entre ediciones) la regla
 * de visibilidad trata el ranking como oculto; getShowRanking conserva su contrato.
 */
describe('SettingsService — visibilidad del ranking (ARK-SP1)', () => {
  const prisma = { eventConfiguration: { findFirst: jest.fn(), update: jest.fn() } };
  const service = new SettingsService(prisma as any);

  beforeEach(() => jest.resetAllMocks());

  it('isRankingVisible devuelve false sin edición activa (no lanza)', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue(null);
    await expect(service.isRankingVisible()).resolves.toBe(false);
  });

  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
  ])(
    'BG-67: isRankingVisible con showRanking=%s y showFinalGrade=%s ⇒ %s',
    async (showRanking, showFinalGrade, expected) => {
      prisma.eventConfiguration.findFirst.mockResolvedValue({
        id: 1,
        showRanking,
        showFinalGrade,
      });
      await expect(service.isRankingVisible()).resolves.toBe(expected);
    },
  );

  it('BG-67: getShowRanking es false si el ranking está publicado pero la nota final no', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      id: 1,
      showRanking: true,
      showFinalGrade: false,
    });
    await expect(service.getShowRanking()).resolves.toEqual({ showRanking: false });
  });

  it('BG-67: publicar el ranking sin la nota final liberada responde 400 y no guarda', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      id: 1,
      showRanking: false,
      showFinalGrade: false,
    });
    const err = await service.setShowRanking(true).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'RANKING_REQUIRES_FINAL_GRADE' });
    expect(prisma.eventConfiguration.update).not.toHaveBeenCalled();
  });

  it('BG-67: con la nota final liberada el ranking se publica', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      id: 1,
      showRanking: false,
      showFinalGrade: true,
    });
    prisma.eventConfiguration.update.mockResolvedValue({ showRanking: true });
    await expect(service.setShowRanking(true)).resolves.toEqual({ showRanking: true });
    expect(prisma.eventConfiguration.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { showRanking: true } }),
    );
  });

  it('BG-67: ocultar el ranking se puede siempre', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue({
      id: 1,
      showRanking: true,
      showFinalGrade: false,
    });
    prisma.eventConfiguration.update.mockResolvedValue({ showRanking: false });
    await expect(service.setShowRanking(false)).resolves.toEqual({ showRanking: false });
  });

  it('getShowRanking sigue lanzando NotFound sin edición activa', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue(null);
    await expect(service.getShowRanking()).rejects.toThrow(NotFoundException);
  });
});
