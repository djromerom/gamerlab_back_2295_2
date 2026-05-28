import { Test, TestingModule } from '@nestjs/testing';
import { HistoricalsService } from './historicals.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HistoricalsService', () => {
  let service: HistoricalsService;

  const mockPrismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoricalsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<HistoricalsService>(HistoricalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
