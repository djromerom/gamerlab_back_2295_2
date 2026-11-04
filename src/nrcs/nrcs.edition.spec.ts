import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NrcsService } from './nrcs.service';
import { NrcsController } from './nrcs.controller';

/**
 * ARK-136 (BG-23): la lista de NRC del administrador es por edición (la activa por defecto) y el
 * panel puede saber si la edición activa ya tiene NRC antes de abrir las inscripciones.
 */
describe('NRC por edición (ARK-136)', () => {
  const prisma = {
    edition: { findFirst: jest.fn(), findUnique: jest.fn() },
    nRC: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const active = { id: 5, title: 'Feria 5', status: 'ACTIVE' };
  const past = { id: 4, title: 'Feria 4', status: 'INACTIVE' };
  let service: NrcsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.nRC.findMany.mockResolvedValue([]);
    prisma.nRC.count.mockResolvedValue(0);
    service = new NrcsService(prisma as any);
  });

  describe('findAll', () => {
    it('sin editionId lista solo los NRC de la edición activa y devuelve la edición', async () => {
      prisma.edition.findFirst.mockResolvedValue(active);
      prisma.nRC.findMany.mockResolvedValue([{ id: 1, code: 2501, editionId: 5 }]);
      prisma.nRC.count.mockResolvedValue(1);

      const result = await service.findAll(false, 20, 1);

      expect(prisma.nRC.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { editionId: 5, isActive: true } }),
      );
      expect(prisma.nRC.count).toHaveBeenCalledWith({ where: { editionId: 5, isActive: true } });
      expect(result.edition).toEqual({ id: 5, title: 'Feria 5', status: 'ACTIVE', readOnly: false });
      expect(result.metadata.totalItems).toBe(1);
    });

    it('con editionId de una edición anterior la consulta como historial (readOnly)', async () => {
      prisma.edition.findUnique.mockResolvedValue(past);

      const result = await service.findAll(true, 20, 1, 4);

      expect(prisma.nRC.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { editionId: 4 } }),
      );
      expect(result.edition).toMatchObject({ id: 4, readOnly: true });
      expect(prisma.edition.findFirst).not.toHaveBeenCalled();
    });

    it('sin edición activa devuelve lista vacía sin consultar NRC', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      const result = await service.findAll(false, 20, 1);

      expect(result).toEqual({
        data: [],
        metadata: { totalItems: 0, itemsOnCurrentPage: 0, currentPage: 1, itemsPerPage: 20, totalPages: 0 },
        edition: null,
      });
      expect(prisma.nRC.findMany).not.toHaveBeenCalled();
    });

    it('una edición que no existe responde 404', async () => {
      prisma.edition.findUnique.mockResolvedValue(null);

      await expect(service.findAll(false, 20, 1, 999)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.nRC.findMany).not.toHaveBeenCalled();
    });
  });

  describe('registrationReadiness', () => {
    it('cuenta solo los NRC activos de la edición activa', async () => {
      prisma.edition.findFirst.mockResolvedValue(active);
      prisma.nRC.count.mockResolvedValue(3);

      await expect(service.registrationReadiness()).resolves.toEqual({
        edition: { id: 5, title: 'Feria 5' },
        activeNrcCount: 3,
        hasActiveNrcs: true,
      });
      expect(prisma.nRC.count).toHaveBeenCalledWith({ where: { editionId: 5, isActive: true } });
    });

    it('edición activa sin NRC: hasActiveNrcs = false', async () => {
      prisma.edition.findFirst.mockResolvedValue(active);
      prisma.nRC.count.mockResolvedValue(0);

      await expect(service.registrationReadiness()).resolves.toMatchObject({
        activeNrcCount: 0,
        hasActiveNrcs: false,
      });
    });

    it('sin edición activa: sin edición y sin NRC', async () => {
      prisma.edition.findFirst.mockResolvedValue(null);

      await expect(service.registrationReadiness()).resolves.toEqual({
        edition: null,
        activeNrcCount: 0,
        hasActiveNrcs: false,
      });
      expect(prisma.nRC.count).not.toHaveBeenCalled();
    });
  });

  describe('controller: ?editionId=', () => {
    const nrcService = { findAll: jest.fn() };
    const controller = new NrcsController(nrcService as any);
    const query = { includeInactive: false, limit: 20, page: 1 };

    it('pasa el editionId numérico al servicio', () => {
      controller.findAll(query, '4');
      expect(nrcService.findAll).toHaveBeenCalledWith(false, 20, 1, 4);
    });

    it('sin editionId usa la edición activa (undefined)', () => {
      controller.findAll(query, undefined);
      expect(nrcService.findAll).toHaveBeenCalledWith(false, 20, 1, undefined);
    });

    it('un editionId inválido responde 400', () => {
      expect(() => controller.findAll(query, 'abc')).toThrow(BadRequestException);
    });
  });
});
