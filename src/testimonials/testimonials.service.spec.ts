import { Test, TestingModule } from '@nestjs/testing';
import { TestimonialsService } from './testimonials.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('TestimonialsService', () => {
  let service: TestimonialsService;
  let prisma: PrismaService;

  const mockTestimonial = {
    id: 1,
    editionId: 1,
    name: 'John Doe',
    role: 'Student',
    quote: 'Great event',
  };

  const mockPrismaService = {
    testimonial: {
      create: jest.fn().mockResolvedValue(mockTestimonial),
      findMany: jest.fn().mockResolvedValue([mockTestimonial]),
      findFirst: jest.fn().mockResolvedValue(mockTestimonial),
      update: jest.fn().mockResolvedValue({ ...mockTestimonial, name: 'Updated' }),
      delete: jest.fn().mockResolvedValue(mockTestimonial),
      count: jest.fn().mockResolvedValue(1),
    },
    // $transaction receives an array of Prisma queries and resolves them in order
    $transaction: jest.fn((queries) => Promise.all(queries)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestimonialsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TestimonialsService>(TestimonialsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a testimonial', async () => {
      const dto = { name: 'John Doe', role: 'Student', quote: 'Great event' };
      const result = await service.create(1, dto);
      expect(prisma.testimonial.create).toHaveBeenCalledWith({
        data: { editionId: 1, ...dto },
      });
      expect(result).toEqual(mockTestimonial);
    });
  });

  describe('findAll', () => {
    it('should return a paginated result of testimonials', async () => {
      const query = { limit: 10, page: 1, includeInactive: false };
      const result = await service.findAll(1, query);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.testimonial.findMany).toHaveBeenCalledWith({
        where: { editionId: 1 },
        take: 10,
        skip: 0,
      });
      expect(result).toMatchObject({
        data: [mockTestimonial],
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
    it('should return a single testimonial if it exists', async () => {
      const result = await service.findOne(1, 1);
      expect(prisma.testimonial.findFirst).toHaveBeenCalledWith({
        where: { id: 1, editionId: 1 },
      });
      expect(result).toEqual(mockTestimonial);
    });

    it('should throw NotFoundException if testimonial does not exist', async () => {
      mockPrismaService.testimonial.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a testimonial', async () => {
      const dto = { name: 'Updated' };
      const result = await service.update(1, 1, dto);
      expect(prisma.testimonial.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: dto,
      });
      expect(result.name).toEqual('Updated');
    });
  });

  describe('remove', () => {
    it('should remove a testimonial', async () => {
      const result = await service.remove(1, 1);
      expect(prisma.testimonial.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(mockTestimonial);
    });
  });
});
