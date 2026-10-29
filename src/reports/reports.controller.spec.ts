import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager'; // Importar CACHE_MANAGER
import { Reflector } from '@nestjs/core'; // Importar Reflector
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { OptionalAdminRoleGuard } from '../auth/guards/admin-role.guard';

describe('ReportsController', () => {
  let controller: ReportsController;

  const mockReportsService = {
    getVideogamesData: jest.fn(),
    getSubjects: jest.fn(),
    getSubjectAverageScores: jest.fn(),
    getNrcWithSubjectNameAndAverage: jest.fn(),
    getJuradosData: jest.fn(),
    getVideogamesDataFilter: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    reset: jest.fn(),
  };

  const mockReflector = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
        {
          provide: CACHE_MANAGER, // Usar el token correcto
          useValue: mockCacheManager,
        },
        {
          provide: Reflector, // Añadir el mock para Reflector
          useValue: mockReflector,
        },
      ],
    })
      .overrideGuard(RolePermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalAdminRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
