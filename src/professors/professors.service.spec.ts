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
  videogame: {
    findUnique: jest.fn(),
  },
  team: {
    findFirst: jest.fn(),
  },
  evaluation: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
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

    // ARK-130: la edición activa sale del método central (findActiveEdition)
    expect(mockPrismaService.edition.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: EditionStatus.ACTIVE },
        orderBy: { id: 'desc' },
      }),
    );
    expect(mockPrismaService.nRC.findFirst).not.toHaveBeenCalled();
  });

  it('BG-37: guardar sobre una evaluación inactiva la reactiva para que cuente', async () => {
    mockPrismaService.videogame.findUnique.mockResolvedValueOnce({
      id: 24,
      teamId: 7,
    });
    mockPrismaService.edition.findFirst.mockResolvedValueOnce({
      id: 3,
      eventConfiguration: { evaluationsOpen: true },
    });
    mockPrismaService.team.findFirst.mockResolvedValueOnce({ id: 7 });
    mockPrismaService.evaluation.findUnique.mockResolvedValueOnce({
      id: 1,
      isActive: false,
    });
    mockPrismaService.evaluation.upsert.mockResolvedValueOnce({ id: 1 });

    await service.updateTeamEvaluation(24, 'prof-1', 3.5, true);

    expect(mockPrismaService.evaluation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ totalScore: 3.5, isActive: true }),
      }),
    );
  });

  describe("getGradingFilterOptions", () => {
    const hist = (nrcId: number, code: number, editionId: number) => ({
      nrcId,
      code,
      member: { team: { editionId } },
    });

    beforeEach(() => {
      jest.clearAllMocks();
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

      const { nrcs } = await service.getGradingFilterOptions('prof-1', {
        includeHistorical: true,
      });

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

      const { nrcs } = await service.getGradingFilterOptions('prof-1', {
        includeHistorical: true,
      });

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
          where: {
            professorId: 'prof-1',
            isActive: true,
            edition: { status: EditionStatus.ACTIVE },
          },
        }),
      );
    });

    it('por defecto solo ofrece NRC de la feria activa y ningun historico (igual que el listado)', async () => {
      mockPrismaService.nRC.findMany.mockResolvedValue([
        { id: 1, code: 100, editionId: 4 },
      ]);
      mockPrismaService.edition.findMany.mockResolvedValue([{ id: 4 }]);

      const result = await service.getGradingFilterOptions('prof-1');

      expect(
        mockPrismaService.historicalMemberNrc.findMany,
      ).not.toHaveBeenCalled();
      expect(mockPrismaService.nRC.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.edition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [4] } } }),
      );
      expect(result).toEqual({
        editions: [{ id: 4 }],
        nrcs: [{ id: 1, code: 100, editionId: 4, source: 'current' }],
      });
    });

    it('includeHistorical toma las ferias de todos los NRC activos del profesor y solo sus NRC historicos (BG-63)', async () => {
      mockPrismaService.nRC.findMany
        .mockResolvedValueOnce([{ id: 1, code: 100, editionId: 4 }])
        .mockResolvedValueOnce([{ editionId: 4 }, { editionId: 2 }])
        .mockResolvedValueOnce([{ id: 1 }, { id: 7 }]);
      mockPrismaService.historicalMemberNrc.findMany.mockResolvedValue([
        hist(7, 700, 2),
      ]);

      const { nrcs } = await service.getGradingFilterOptions('prof-1', {
        includeHistorical: true,
      });

      expect(mockPrismaService.nRC.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { professorId: 'prof-1', isActive: true },
        }),
      );
      expect(
        mockPrismaService.historicalMemberNrc.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            nrcId: { in: [1, 7] },
            member: { team: { editionId: { in: [4, 2] } } },
          },
        }),
      );
      // Los NRC del profesor en cualquier feria (sin filtrar por activo)
      expect(mockPrismaService.nRC.findMany).toHaveBeenNthCalledWith(3, {
        where: { professorId: 'prof-1' },
        select: { id: true },
      });
      expect(nrcs).toEqual([
        { id: 1, code: 100, editionId: 4, source: 'current' },
        { id: 7, code: 700, editionId: 2, source: 'historical' },
      ]);
    });

    it('BG-63: el Administrador recibe los NRC historicos de todos los profesores', async () => {
      mockPrismaService.nRC.findMany.mockResolvedValue([{ editionId: 2 }]);

      await service.getGradingFilterOptions('admin-1', {
        roleId: 1,
        includeHistorical: true,
      });

      expect(mockPrismaService.nRC.findMany).toHaveBeenCalledTimes(2);
      expect(
        mockPrismaService.historicalMemberNrc.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { member: { team: { editionId: { in: [2] } } } },
        }),
      );
    });

    it('el Administrador recibe los NRC activos de todos los profesores', async () => {
      await service.getGradingFilterOptions('admin-1', { roleId: 1 });

      expect(mockPrismaService.nRC.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, edition: { status: EditionStatus.ACTIVE } },
        }),
      );
    });
  });
});
