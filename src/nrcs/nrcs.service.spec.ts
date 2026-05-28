import { Test, TestingModule } from '@nestjs/testing';
import { NrcsService } from './nrcs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NrcsService', () => {
  let service: NrcsService;

  const mockPrismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NrcsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<NrcsService>(NrcsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
