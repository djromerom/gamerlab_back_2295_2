import { Test, TestingModule } from '@nestjs/testing';
import { ProfessorsService } from './professors.service';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExcelExportService } from './excel-export.service';

const mockAuthService = {
  getUser: jest.fn(),
};

const mockPrismaService = {
  getProfessors: jest.fn(),
};

const mockExcelExportService = {
  exportToExcel: jest.fn(),
};

describe('ProfessorsService', () => {
  let service: ProfessorsService;


  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfessorsService,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ExcelExportService,
          useValue: mockExcelExportService,
        },
      ],
    }).compile();

    service = module.get<ProfessorsService>(ProfessorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
