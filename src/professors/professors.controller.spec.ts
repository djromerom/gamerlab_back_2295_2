import { Test, TestingModule } from '@nestjs/testing';
import { ProfessorsController } from './professors.controller';
import { ProfessorsService } from './professors.service';
import { ExcelExportService } from './excel-export.service';
import { GradingReportExportService } from './grading-report-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ConfigService } from '@nestjs/config';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { GradingReportQueryDto } from './dto/professor-panel-query.dto';

// Smoke test to ensure the controller can be instantiated without errors
describe('ProfessorsController', () => {
  let controller: ProfessorsController;

  const mockProfessorsService = {
    create: jest.fn(),
    findForSelect: jest.fn(),
    findAll: jest.fn(),
    findNrcs: jest.fn(),
    findSubjects: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getNRCreport: jest.fn(),
    getJurorEvaluations: jest.fn(),
    GetSignatureReport: jest.fn(),
    downloadGradingReportGrouped: jest.fn(),
    updateTeamEvaluation: jest.fn(),
  };
  const mockExcelExportService = {
    generateAndStream: jest.fn(),
  };
  const mockGradingReportExport = {
    exportFiltered: jest.fn(),
  };
  const mockPrismaService = {};
  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
  const mockConfigService = {
    get: jest.fn(),
  };
  const mockRolePermissionGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };
  const mockReflector = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfessorsController],
      providers: [
        {
          provide: ProfessorsService,
          useValue: mockProfessorsService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ExcelExportService,
          useValue: mockExcelExportService,
        },
        {
          provide: GradingReportExportService,
          useValue: mockGradingReportExport,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RolePermissionGuard,
          useValue: mockRolePermissionGuard,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    controller = module.get<ProfessorsController>(ProfessorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('downloadGradingReportGrouped delega los filtros en GradingReportExportService', async () => {
    const res = {} as Response;
    const query = {
      editionId: 3,
      nrcId: 5,
      search: 'bosque',
      sortBy: 'student',
      sortOrder: 'desc',
      final: true,
    } as GradingReportQueryDto;

    await controller.downloadGradingReportGrouped('prof-1', res, query);

    expect(mockGradingReportExport.exportFiltered).toHaveBeenCalledWith(
      'prof-1',
      query,
      res,
    );
  });
});

// Unit tests for controller methods should go here (GET, POST, etc)