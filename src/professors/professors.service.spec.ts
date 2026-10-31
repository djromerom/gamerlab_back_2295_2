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
    findMany: jest.fn(),
  },
  nRC: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  historicalMemberNrc: {
    findMany: jest.fn(),
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

  describe("getGradingFilterOptions", () => {
    const hist = (nrcId: number, code: number, editionId: number) => ({
      nrcId,
      code,
      member: { team: { editionId } },
    });

    beforeEach(() => {
      mockPrismaService.edition.findMany.mockResolvedValue([]);
      mockPrismaService.nRC.findMany.mockResolvedValue([]);
      mockPrismaService.historicalMemberNrc.findMany.mockResolvedValue([]);
    });

    it("no repite el mismo NRC historico por integrante", async () => {
      mockPrismaService.nRC.findMany.mockResolvedValue([
        { id: 1, code: 100, editionId: 4 },
      ]);
      mockPrismaService.historicalMemberNrc.findMany.mockResolvedValue([
        hist(9, 900, 4),
        hist(9, 900, 4),
        hist(9, 900, 4),
      ]);

      const { nrcs } = await service.getGradingFilterOptions("prof-1");

      expect(nrcs.filter((n) => n.id === 9)).toHaveLength(1);
    });

    it("un NRC de feria archivada sale una sola vez (prefiere current)", async () => {
      mockPrismaService.nRC.findMany.mockResolvedValue([
        { id: 5, code: 500, editionId: 3 },
      ]);
      mockPrismaService.historicalMemberNrc.findMany.mockResolvedValue([
        hist(5, 500, 3),
        hist(5, 500, 3),
      ]);

      const { nrcs } = await service.getGradingFilterOptions("prof-1");

      const matches = nrcs.filter((n) => n.id === 5 && n.editionId === 3);
      expect(matches).toHaveLength(1);
      expect(matches[0].source).toBe("current");
    });

    it("no incluye NRC con isActive=false", async () => {
      const rows = [
        { id: 1, code: 100, editionId: 4, isActive: true },
        { id: 2, code: 200, editionId: 4, isActive: false },
      ];
      mockPrismaService.nRC.findMany.mockImplementation(
        ({ where }: { where: { isActive?: boolean } }) =>
          Promise.resolve(
            rows.filter(
              (r) => where.isActive === undefined || r.isActive === where.isActive,
            ),
          ),
      );

      const { nrcs } = await service.getGradingFilterOptions("prof-1");

      expect(nrcs.map((n) => n.id)).toEqual([1]);
      expect(mockPrismaService.nRC.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { professorId: "prof-1", isActive: true },
        }),
      );
      });
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
