import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { CACHE_MANAGER } from '@nestjs/cache-manager'; // Importar CACHE_MANAGER
import { Reflector } from '@nestjs/core'; // Importar Reflector
import { OptionalAdminRoleGuard } from '../auth/guards/admin-role.guard';
import { SettingsService } from '../settings/settings.service';

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
          provide: SettingsService,
          useValue: { getShowRanking: jest.fn() },
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
      // La autorización (permisos por rol) se prueba aparte en
      // `auth/route-access.spec.ts`; aquí solo se prueba la lógica del controlador.
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

  it('exportJurados responde con Content-Type de hoja de cálculo y Content-Disposition', async () => {
    mockReportsService.getJuradosData.mockResolvedValue([]);
    const headers: Record<string, string> = {};
    const { PassThrough } = await import('stream');
    const res: any = new PassThrough();
    res.setHeader = (k: string, v: string) => {
      headers[k] = v;
    };
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn();
    res.resume();

    await controller.exportJurados(res);

    expect(headers['Content-Type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename=reporte_jurados.xlsx',
    );
  });
});
