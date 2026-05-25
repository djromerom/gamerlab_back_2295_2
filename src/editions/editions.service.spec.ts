import { Test, TestingModule } from '@nestjs/testing';
import { EditionsService } from './editions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AzureStorageService } from '../upload/azure-storage.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('EditionsService', () => {
  let service: EditionsService;
  let prisma: PrismaService;

  const mockEdition = {
    id: 1,
    year: 2025,
    semester: 10,
    title: 'Test Edition',
    isActive: false,
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EditionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AzureStorageService, useValue: mockAzureStorageService },
      ],
    }).compile();

    service = module.get<EditionsService>(EditionsService);
    prisma = module.get<PrismaService>(PrismaService);
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
    it('should deactivate all others and activate the specified edition', async () => {
      await service.activate(1);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.edition.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
      expect(prisma.edition.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: true },
      });
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
