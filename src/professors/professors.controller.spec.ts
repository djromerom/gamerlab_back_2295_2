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
import { ForbiddenException } from '@nestjs/common';
import { ROLE_IDS } from '../auth/constants/roles';
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

  // ARK-SP1 #12: un Profesor solo puede leer su propio registro.
  describe('findOne (ARK-SP1 #12)', () => {
    const ownId = '11111111-1111-4111-8111-111111111111';
    const otherId = '22222222-2222-4222-8222-222222222222';

    beforeEach(() => {
      mockProfessorsService.findOne.mockReset();
      mockProfessorsService.findOne.mockResolvedValue({ id: ownId });
    });

    it('Profesor consultando otro id => 403', () => {
      const user = { id: ownId, roleId: ROLE_IDS.PROFESSOR } as any;
      expect(() => controller.findOne(otherId, user)).toThrow(ForbiddenException);
      expect(mockProfessorsService.findOne).not.toHaveBeenCalled();
    });

    it('Profesor consultando su propio id => 200', async () => {
      const user = { id: ownId, roleId: ROLE_IDS.PROFESSOR } as any;
      await expect(controller.findOne(ownId, user)).resolves.toEqual({ id: ownId });
    });

    it('Administrador consultando cualquier id => 200', async () => {
      const user = { id: 'admin', roleId: ROLE_IDS.ADMIN } as any;
      await expect(controller.findOne(otherId, user)).resolves.toEqual({ id: ownId });
      expect(mockProfessorsService.findOne).toHaveBeenCalledWith(otherId);
    });
  });

  describe('sin hash de contraseña en la respuesta', () => {
    it('GET /professors no incluye password en ninguna fila', async () => {
      mockProfessorsService.findAll = jest.fn().mockResolvedValue({
        data: [{ id: 'p1', password: 'h1' }, { id: 'p2', password: 'h2' }],
        metadata: { totalItems: 2 },
      });
      const result = await controller.findAll({
        includeInactive: false,
        limit: 10,
        page: 1,
      } as any);
      expect(result.data).toHaveLength(2);
      for (const row of result.data) expect(row).not.toHaveProperty('password');
      expect(result.metadata).toEqual({ totalItems: 2 });
    });

    const user = { id: 'p1', email: 'p@x.co', password: '$2b$hash' };

    it('create, findOne y update no incluyen password', async () => {
      mockProfessorsService.create.mockResolvedValue(user);
      mockProfessorsService.findOne.mockResolvedValue(user);
      mockProfessorsService.update.mockResolvedValue(user);

      const created = await controller.create({ email: 'p@x.co' } as any);
      const found = await controller.findOne('p1', {
        id: 'admin',
        roleId: ROLE_IDS.ADMIN,
      } as any);
      const updated = await controller.update('p1', {} as any);

      for (const r of [created, found, updated]) {
        expect(r).not.toHaveProperty('password');
        expect(r).toMatchObject({ id: 'p1', email: 'p@x.co' });
      }
    });
  });
});
