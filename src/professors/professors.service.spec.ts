import { Test, TestingModule } from '@nestjs/testing';
import { ProfessorsService } from './professors.service';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExcelExportService } from './excel-export.service';
import { EditionStatus } from '@prisma/client';

const mockAuthService = {
  getUser: jest.fn(),
};

const mockPrismaService = {
  getProfessors: jest.fn(),
  edition: {
    findFirst: jest.fn(),
  },
  nRC: {
    findFirst: jest.fn(),
  },
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

  it('rejects an NRC report request for an archived edition', async () => {
    mockPrismaService.edition.findFirst.mockResolvedValue({
      id: 2,
    });

    await expect(
      service.getNrcReportById(
        10,
        1,
        false,
        20,
        1,
        'professor-id',
      ),
    ).rejects.toThrow('NRC 10 does not belong to the active edition');

    expect(mockPrismaService.edition.findFirst).toHaveBeenCalledWith({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    expect(mockPrismaService.nRC.findFirst).not.toHaveBeenCalled();
  });

  describe('getGradingGames — mensajes por parámetro (M6)', () => {
    const base = { page: 1, limit: 25 };
    const cases: Array<[string, any, string]> = [
      ['sortBy', { sortBy: 'hack' }, 'sortBy inválido'],
      ['sortOrder', { sortOrder: 'up' }, 'sortOrder inválido'],
      ['editionId', { editionId: 0 }, 'editionId/nrcId inválido'],
      ['nrcId', { nrcId: NaN }, 'editionId/nrcId inválido'],
      ['page', { page: 0 }, 'página/límite inválidos'],
      ['limit', { limit: NaN }, 'página/límite inválidos'],
    ];
    it.each(cases)('%s inválido responde 400 con su propio mensaje', async (_n, extra, message) => {
      const err: any = await service
        .getGradingGames('professor-id', { ...base, ...extra })
        .catch((e) => e);
      expect(err.getStatus()).toBe(400);
      expect(err.message).toBe(message);
    });
  });
});
