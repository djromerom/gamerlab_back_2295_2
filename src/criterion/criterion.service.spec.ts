import { Test, TestingModule } from '@nestjs/testing';
import { CriterionService } from './criterion.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CriterionService', () => {
  let service: CriterionService;

  const mockPrismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CriterionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CriterionService>(CriterionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
