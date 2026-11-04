import { blobRefsProvider } from '../upload/blob-reference.mock';
import { Test, TestingModule } from '@nestjs/testing';
import { EditionsService } from './editions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AzureStorageService } from '../upload/azure-storage.service';
import { HistoricalsService } from '../historicals/historicals.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

const EditionStatus = {
  INACTIVE: 'INACTIVE',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
};

describe('EditionsService', () => {
  let service: EditionsService;
  let prisma: PrismaService;
  let historicalsService: HistoricalsService;
  

  const mockEdition = {
    id: 1,
    year: 2025,
    semester: 10,
    title: 'Test Edition',
    status: EditionStatus.INACTIVE,
    mainPhoto: null,
    photos: [],
  };

  const mockPrismaService: any = {
    edition: {
      create: jest.fn().mockResolvedValue(mockEdition),
      findMany: jest.fn().mockResolvedValue([mockEdition]),
      findUnique: jest.fn().mockResolvedValue(mockEdition),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...mockEdition, status: EditionStatus.ARCHIVED }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ ...mockEdition, title: 'Updated' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue(mockEdition),
      count: jest.fn().mockResolvedValue(1),
    },
    eventConfiguration: {
      upsert: jest.fn().mockResolvedValue({ id: 1, editionId: 1 }),
    },
    // $transaction can receive an array of promises or a callback function
    $transaction: jest.fn(async (arg) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === 'function') {
        return arg(mockPrismaService);
      }
    }),
  };

  const mockAzureStorageService = {
    getReadSasUrlById: jest.fn().mockResolvedValue({ url: 'http://sas.url', expiresAt: '2025-01-01' }),
    uploadFile: jest.fn().mockResolvedValue({ id: 'uuid-1' }),
    deleteById: jest.fn().mockResolvedValue({ id: 'uuid-1', deleted: true }),
  };

  const mockHistoricalsService = {
    dumpEdition: jest.fn().mockResolvedValue({
      success: true,
      message: 'Volcado histórico realizado correctamente',
      teamsDumpedCount: 3,
    }),
    createHistoricalEditionDump: jest.fn().mockResolvedValue({
      success: true,
      message: 'Volcado histórico realizado correctamente',
      teamsDumpedCount: 3,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EditionsService,
        blobRefsProvider,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AzureStorageService, useValue: mockAzureStorageService },
        { provide: HistoricalsService, useValue: mockHistoricalsService },
      ],
    }).compile();

    service = module.get<EditionsService>(EditionsService);
    prisma = module.get<PrismaService>(PrismaService);
    historicalsService = module.get<HistoricalsService>(HistoricalsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an edition', async () => {
      const dto = { year: 2025, semester: 10, title: 'Test Edition', startsAt: new Date(), endsAt: new Date() };
      const result = await service.create(dto);
      expect(prisma.edition.create).toHaveBeenCalledWith({
        data: { ...dto, eventConfiguration: { create: {} } },
      });
      expect(result).toEqual(mockEdition);
    });

    it('crea la configuración del evento junto con la edición, en la misma operación (ARK-123)', async () => {
      const dto = { year: 2027, semester: 10, title: 'Nueva', startsAt: new Date(), endsAt: new Date() };
      await service.create(dto);
      // Anidada en el mismo create: o se crean las dos filas o ninguna. `create: {}` deja los
      // valores por defecto de la tabla (todo cerrado).
      const { data } = (prisma.edition.create as jest.Mock).mock.calls.at(-1)[0];
      expect(data.eventConfiguration).toEqual({ create: {} });
    });

    it('rechaza con 400 una edición cuyo fin es anterior al inicio (M7)', async () => {
      const dto = { year: 2026, semester: 10, title: 'Mal', startsAt: new Date('2026-06-01'), endsAt: new Date('2026-01-01') };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(prisma.edition.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if an edition with the same year and semester exists', async () => {
      mockPrismaService.edition.findFirst.mockResolvedValueOnce({ id: 7 });
      const dto = { year: 2026, semester: 30, title: 'Repetida', startsAt: new Date(), endsAt: new Date() };
      await expect(service.create(dto)).rejects.toThrow(new ConflictException('La edición ya existe'));
      expect(prisma.edition.findFirst).toHaveBeenCalledWith({
        where: { year: 2026, semester: 30 },
        select: { id: true },
      });
      expect(prisma.edition.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when the unique constraint rejects a concurrent duplicate', async () => {
      mockPrismaService.edition.create.mockRejectedValueOnce({ code: 'P2002', message: 'Unique constraint failed' });
      const dto = { year: 2026, semester: 30, title: 'Repetida', startsAt: new Date(), endsAt: new Date() };
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return a paginated result of editions', async () => {
      const query = { limit: 10, page: 1, includeInactive: false };
      const result = await service.findAll(query);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.edition.findMany).toHaveBeenCalledWith({
        take: 10,
        skip: 0,
        orderBy: [{ year: 'desc' }, { semester: 'desc' }],
      });
      expect(result).toMatchObject({
        data: [mockEdition],
        metadata: {
          totalItems: 1,
          currentPage: 1,
          itemsPerPage: 10,
          totalPages: 1,
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return a single edition if it exists', async () => {
      const result = await service.findOne(1);
      expect(prisma.edition.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: expect.any(Object),
      });
      expect(result).toEqual(mockEdition);
    });

    it('should throw NotFoundException if edition does not exist', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an edition', async () => {
      const dto = { title: 'Updated' };
      const result = await service.update(1, dto);
      expect(prisma.edition.update).toHaveBeenCalledWith({ where: { id: 1 }, data: dto });
      expect(result.title).toEqual('Updated');
      expect(prisma.edition.findFirst).not.toHaveBeenCalled();
    });

    describe('fechas (M7)', () => {
      const withDates = (startsAt: Date, endsAt: Date) =>
        mockPrismaService.edition.findUnique.mockResolvedValueOnce({ ...mockEdition, startsAt, endsAt });

      it('rechaza un endsAt anterior al startsAt enviados juntos', async () => {
        await expect(
          service.update(1, { startsAt: new Date('2026-06-01'), endsAt: new Date('2026-01-01') }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.edition.update).not.toHaveBeenCalled();
      });

      it('rechaza un endsAt parcial anterior al startsAt existente', async () => {
        withDates(new Date('2026-03-01'), new Date('2026-09-01'));
        await expect(service.update(1, { endsAt: new Date('2026-01-01') })).rejects.toThrow(BadRequestException);
        expect(prisma.edition.update).not.toHaveBeenCalled();
      });

      it('rechaza un startsAt parcial posterior al endsAt existente', async () => {
        withDates(new Date('2026-03-01'), new Date('2026-09-01'));
        await expect(service.update(1, { startsAt: new Date('2026-12-01') })).rejects.toThrow(BadRequestException);
      });

      it('un PATCH que no toca fechas no falla aunque la edición ya tenga el fin antes del inicio', async () => {
        withDates(new Date('2026-09-01'), new Date('2026-03-01'));
        await expect(service.update(1, { title: 'Updated' })).resolves.toBeDefined();
        expect(prisma.edition.update).toHaveBeenCalled();
      });
    });

    it('should throw ConflictException when changing to the year and semester of another edition', async () => {
      mockPrismaService.edition.findFirst.mockResolvedValueOnce({ id: 2 });
      await expect(service.update(1, { semester: 30 })).rejects.toThrow(ConflictException);
      expect(prisma.edition.findFirst).toHaveBeenCalledWith({
        where: { year: 2025, semester: 30, id: { not: 1 } },
        select: { id: true },
      });
      expect(prisma.edition.update).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('should deactivate all others and activate the specified edition (INACTIVE → ACTIVE)', async () => {
      await service.activate(1);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.edition.updateMany).toHaveBeenCalledWith({
        where: { status: EditionStatus.ACTIVE },
        data: { status: EditionStatus.INACTIVE },
      });
      expect(prisma.edition.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: EditionStatus.ACTIVE },
      });
    });

    it('asegura la configuración del evento de la edición que se activa (ARK-123)', async () => {
      await service.activate(1);
      // upsert con `update: {}`: si la fila ya existe no se tocan sus interruptores.
      expect(prisma.eventConfiguration.upsert).toHaveBeenCalledWith({
        where: { editionId: 1 },
        update: {},
        create: { editionId: 1 },
      });
    });

    it('no crea configuración cuando la edición está ARCHIVED (ARK-123)', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce({
        ...mockEdition,
        status: EditionStatus.ARCHIVED,
      });
      await expect(service.activate(1)).rejects.toThrow(BadRequestException);
      expect(prisma.eventConfiguration.upsert).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when trying to activate an ARCHIVED edition', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce({
        ...mockEdition,
        status: EditionStatus.ARCHIVED,
      });
      await expect(service.activate(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if edition does not exist', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce(null);
      await expect(service.activate(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    // ARK-137: volcado y cambio de estado van en una sola transacción
    it('marca la edición ARCHIVED y vuelca el historial en la misma transacción', async () => {
      const result = await service.archive(1);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ timeout: expect.any(Number) }));
      expect(prisma.edition.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: EditionStatus.INACTIVE },
        data: { status: EditionStatus.ARCHIVED },
      });
      expect(mockHistoricalsService.dumpEdition).toHaveBeenCalledWith(mockPrismaService, 1, { allowEmpty: true });
      expect(mockHistoricalsService.createHistoricalEditionDump).not.toHaveBeenCalled();
      expect(result.status).toEqual(EditionStatus.ARCHIVED);
    });

    it('should throw BadRequestException when trying to archive an ACTIVE edition', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce({
        ...mockEdition,
        status: EditionStatus.ACTIVE,
      });
      await expect(service.archive(1)).rejects.toThrow(BadRequestException);
      expect(mockHistoricalsService.dumpEdition).not.toHaveBeenCalled();
      expect(prisma.edition.updateMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when trying to archive an already ARCHIVED edition', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce({
        ...mockEdition,
        status: EditionStatus.ARCHIVED,
      });
      await expect(service.archive(1)).rejects.toThrow(BadRequestException);
      expect(mockHistoricalsService.dumpEdition).not.toHaveBeenCalled();
    });

    it('si otra petición la archivó o activó en medio, responde 400 y no vuelca', async () => {
      mockPrismaService.edition.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.archive(1)).rejects.toThrow(/cambió de estado/);
      expect(mockHistoricalsService.dumpEdition).not.toHaveBeenCalled();
    });

    it('si el volcado falla, el error sale de la transacción (que deshace el ARCHIVED)', async () => {
      mockHistoricalsService.dumpEdition.mockRejectedValueOnce(
        new BadRequestException('La edición 1 ya tiene volcado histórico'),
      );
      await expect(service.archive(1)).rejects.toThrow(BadRequestException);
      expect(prisma.edition.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove an edition', async () => {
      const result = await service.remove(1);
      expect(prisma.edition.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(mockEdition);
    });
  });

  describe('uploadPhotos', () => {
    it('should throw BadRequestException if exceeding 50 images limit', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce({
        ...mockEdition,
        photos: Array(45).fill('uuid'),
      });

      const files = Array(6).fill({ buffer: Buffer.from('test'), size: 100 }) as any;
      await expect(service.uploadPhotos(1, files)).rejects.toThrow(BadRequestException);
    });

    it('should allow upload if not exceeding limit', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce({
        ...mockEdition,
        photos: Array(45).fill('uuid'),
      });
      mockPrismaService.edition.update.mockResolvedValueOnce({
        ...mockEdition,
        photos: Array(50).fill('uuid'),
      });

      const files = Array(5).fill({ buffer: Buffer.from('test'), size: 100 }) as any;
      const result = await service.uploadPhotos(1, files);
      expect(prisma.edition.update).toHaveBeenCalled();
    });
  });
});
