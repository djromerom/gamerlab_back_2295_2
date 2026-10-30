import { Test, TestingModule } from '@nestjs/testing';
import { EditionsService } from './editions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AzureStorageService } from '../upload/azure-storage.service';
import { HistoricalsService } from '../historicals/historicals.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

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
      update: jest.fn().mockResolvedValue({ ...mockEdition, title: 'Updated' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue(mockEdition),
      count: jest.fn().mockResolvedValue(1),
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
      expect(prisma.edition.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(mockEdition);
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
    it('should create historical dump and mark edition as ARCHIVED when INACTIVE', async () => {
      // Arrange: mock del dump retorna 3 equipos procesados
      const dumpResult = {
        success: true,
        message: 'Volcado histórico realizado correctamente',
        teamsDumpedCount: 3,
      };
      mockHistoricalsService.createHistoricalEditionDump.mockResolvedValueOnce(dumpResult);
      mockPrismaService.edition.update.mockResolvedValueOnce({
        ...mockEdition,
        status: EditionStatus.ARCHIVED,
      });

      const result = await service.archive(1);

      expect(historicalsService.createHistoricalEditionDump).toHaveBeenCalledWith(1);
      expect(historicalsService.createHistoricalEditionDump).toHaveBeenCalledTimes(1);
      expect(dumpResult.success).toBe(true);
      expect(dumpResult.teamsDumpedCount).toBeGreaterThan(0);
      expect(prisma.edition.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: EditionStatus.ARCHIVED },
      });
      expect(result.status).toEqual(EditionStatus.ARCHIVED);
    });

    it('should throw BadRequestException when trying to archive an ACTIVE edition', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce({
        ...mockEdition,
        status: EditionStatus.ACTIVE,
      });
      await expect(service.archive(1)).rejects.toThrow(BadRequestException);
      expect(mockHistoricalsService.createHistoricalEditionDump).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when trying to archive an already ARCHIVED edition', async () => {
      mockPrismaService.edition.findUnique.mockResolvedValueOnce({
        ...mockEdition,
        status: EditionStatus.ARCHIVED,
      });
      await expect(service.archive(1)).rejects.toThrow(BadRequestException);
      expect(mockHistoricalsService.createHistoricalEditionDump).not.toHaveBeenCalled();
    });

    it('should propagate error if createHistoricalEditionDump fails (dump already exists)', async () => {
      mockHistoricalsService.createHistoricalEditionDump.mockRejectedValueOnce(
        new BadRequestException(`A historical dump already exists for edition with ID 1`),
      );
      await expect(service.archive(1)).rejects.toThrow(BadRequestException);
      // Should NOT mark as ARCHIVED if the dump failed
      expect(prisma.edition.update).not.toHaveBeenCalled();
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
