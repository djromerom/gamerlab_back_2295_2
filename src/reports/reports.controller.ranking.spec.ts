import { ReportsController } from './reports.controller';
import { ROLE_IDS } from '../auth/constants/roles';

/**
 * ARK-SP1 #1 — la caché de `videojuegoData` (10 min) no puede servir notas viejas
 * al ocultar el ranking: la clave incluye el estado de `showRanking`.
 */
describe('ReportsController.videojuegoData — caché y ranking (ARK-SP1 #1)', () => {
  const reports = { getVideogamesData: jest.fn() };
  const settings = { isRankingVisible: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn() };
  const controller = new ReportsController(
    reports as any,
    settings as any,
    cache as any,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    cache.get.mockResolvedValue(undefined);
  });

  it('usa claves de caché distintas según showRanking', async () => {
    reports.getVideogamesData.mockResolvedValue([]);
    settings.isRankingVisible.mockResolvedValue(true);
    await controller.getWithMateriaYNRC(undefined);
    settings.isRankingVisible.mockResolvedValue(false);
    await controller.getWithMateriaYNRC(undefined);
    const [k1, k2] = cache.get.mock.calls.map((c) => c[0]);
    expect(k1).not.toEqual(k2);
  });

  it('no sirve la respuesta con notas cacheada cuando el ranking pasa a oculto', async () => {
    const conNotas = [{ id: 1, promedio: 5 }];
    const sinNotas = [{ id: 1 }];
    settings.isRankingVisible.mockResolvedValue(false);
    cache.get.mockImplementation((key: string) =>
      Promise.resolve(key.includes('true') ? conNotas : undefined),
    );
    reports.getVideogamesData.mockResolvedValue(sinNotas);
    await expect(controller.getWithMateriaYNRC(undefined)).resolves.toEqual(
      sinNotas,
    );
  });

  it('guarda en caché con TTL de 10 minutos', async () => {
    settings.isRankingVisible.mockResolvedValue(true);
    reports.getVideogamesData.mockResolvedValue([{ id: 1 }]);
    await controller.getWithMateriaYNRC(undefined);
    expect(cache.set).toHaveBeenCalledWith(
      expect.any(String),
      [{ id: 1 }],
      600000,
    );
  });

  it('el administrador con el ranking oculto no usa la caché pública', async () => {
    settings.isRankingVisible.mockResolvedValue(false);
    reports.getVideogamesData.mockResolvedValue([{ id: 1, promedio: 5 }]);
    const admin = { id: 'a', roleId: ROLE_IDS.ADMIN } as any;
    await controller.getWithMateriaYNRC(admin);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(reports.getVideogamesData).toHaveBeenCalledWith(admin, undefined);
  });
});
