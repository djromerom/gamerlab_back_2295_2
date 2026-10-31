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
import { GradingGamesService } from './grading-games.service';
import { GradingGamesQueryDto } from './dto/grading-games-query.dto';
import { AppUser } from 'src/auth/jwt.strategy';

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
    updateTeamEvaluation: jest.fn(),
    getGradingFilterOptions: jest.fn(),
  };
  const mockGradingGames = {
    list: jest.fn(),
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
          provide: GradingGamesService,
          useValue: mockGradingGames,
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

    await controller.downloadGradingReportGrouped('prof-1', res, query, 3);

    expect(mockGradingReportExport.exportFiltered).toHaveBeenCalledWith(
      'prof-1',
      query,
      res,
      3,
    );
  });

  it('getGradingGames delega en GradingGamesService con el rol de la sesión', async () => {
    const user = { id: 'admin-1', roleId: 1 } as AppUser;
    const query = {
      search: 'bosque',
      includeHistorical: true,
    } as GradingGamesQueryDto;

    await controller.getGradingGames(user, query);

    expect(mockGradingGames.list).toHaveBeenCalledWith('admin-1', query, 1);
  });

  it('getGradingGamesFilterOptions pasa rol e includeHistorical', async () => {
    const user = { id: 'prof-1', roleId: 3 } as AppUser;

    await controller.getGradingGamesFilterOptions(user, {
      includeHistorical: false,
    });

    expect(mockProfessorsService.getGradingFilterOptions).toHaveBeenCalledWith(
      'prof-1',
      { roleId: 3, includeHistorical: false },
    );
  });
});

// Unit tests for controller methods should go here (GET, POST, etc)