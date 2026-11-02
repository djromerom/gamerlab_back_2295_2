import { Test, TestingModule } from '@nestjs/testing';
import { EducationalFocusesService } from './educational-focuses.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('EducationalFocusesService', () => {
  let service: EducationalFocusesService;
  let prisma: PrismaService;

  const mockFocus = {
    id: 1,
    editionId: 1,
    title: 'Focus 1',
    description: 'Description 1',
  };

  const mockPrismaService = {
    educationalFocus: {
      create: jest.fn().mockResolvedValue(mockFocus),
      findMany: jest.fn().mockResolvedValue([mockFocus]),
      findFirst: jest.fn().mockResolvedValue(mockFocus),
      update: jest.fn().mockResolvedValue({ ...mockFocus, title: 'Updated' }),
      delete: jest.fn().mockResolvedValue(mockFocus),
      count: jest.fn().mockResolvedValue(1),
    },
    // $transaction receives an array of Prisma queries and resolves them in order
    $transaction: jest.fn((queries) => Promise.all(queries)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EducationalFocusesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<EducationalFocusesService>(EducationalFocusesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an educational focus', async () => {
      const dto = { title: 'Focus 1', description: 'Description 1' };
      const result = await service.create(1, dto);
      expect(prisma.educationalFocus.create).toHaveBeenCalledWith({
        data: { editionId: 1, ...dto },
      });
      expect(result).toEqual(mockFocus);
    });
  });

  describe('findAll', () => {
    it('should return a paginated result of educational focuses', async () => {
      const query = { limit: 10, page: 1, includeInactive: false };
      const result = await service.findAll(1, query);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.educationalFocus.findMany).toHaveBeenCalledWith({
        where: { editionId: 1 },
        take: 10,
        skip: 0,
      });
      expect(result).toMatchObject({
        data: [mockFocus],
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
    it('should return a single educational focus if it exists', async () => {
      const result = await service.findOne(1, 1);
      expect(prisma.educationalFocus.findFirst).toHaveBeenCalledWith({
        where: { id: 1, editionId: 1 },
      });
      expect(result).toEqual(mockFocus);
    });

    it('should throw NotFoundException if educational focus does not exist', async () => {
      mockPrismaService.educationalFocus.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an educational focus', async () => {
      const dto = { title: 'Updated' };
      const result = await service.update(1, 1, dto);
      expect(prisma.educationalFocus.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: dto,
      });
      expect(result.title).toEqual('Updated');
    });
  });

  describe('remove', () => {
    it('should remove an educational focus', async () => {
      const result = await service.remove(1, 1);
      expect(prisma.educationalFocus.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toBeUndefined();
    });
  });
});
