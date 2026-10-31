import { NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * ARK-SP1: sin configuración de edición activa (periodo entre ediciones) la regla
 * de visibilidad trata el ranking como oculto; getShowRanking conserva su contrato.
 */
describe('SettingsService — visibilidad del ranking (ARK-SP1)', () => {
  const prisma = { eventConfiguration: { findFirst: jest.fn() } };
  const service = new SettingsService(prisma as any);

  beforeEach(() => jest.resetAllMocks());

  it('isRankingVisible devuelve false sin edición activa (no lanza)', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue(null);
    await expect(service.isRankingVisible()).resolves.toBe(false);
  });

  it.each([true, false])(
    'isRankingVisible refleja showRanking=%s',
    async (v) => {
      prisma.eventConfiguration.findFirst.mockResolvedValue({
        id: 1,
        showRanking: v,
      });
      await expect(service.isRankingVisible()).resolves.toBe(v);
    },
  );

  it('getShowRanking sigue lanzando NotFound sin edición activa', async () => {
    prisma.eventConfiguration.findFirst.mockResolvedValue(null);
    await expect(service.getShowRanking()).rejects.toThrow(NotFoundException);
  });
});
