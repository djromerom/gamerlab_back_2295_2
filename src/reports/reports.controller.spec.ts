import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PassThrough } from 'stream';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { Reflector } from '@nestjs/core'; // Importar Reflector
import { OptionalAdminRoleGuard } from '../auth/guards/admin-role.guard';

describe('ReportsController', () => {
  let controller: ReportsController;

  const mockReportsService = {
    getVideogamesData: jest.fn(),
    getSubjects: jest.fn(),
    getSubjectAverageScores: jest.fn(),
    getNrcWithSubjectNameAndAverage: jest.fn(),
    getJuradosData: jest.fn(),
    getJurorAssignmentReport: jest.fn(),
    getVideogamesDataFilter: jest.fn(),
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

  function fakeResponse() {
    const headers: Record<string, string> = {};
    const res: any = new PassThrough();
    res.setHeader = (k: string, v: string) => {
      headers[k] = v;
    };
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn();
    res.resume();
    return { res, headers };
  }

  it('exportJurados (HU-16) responde un Excel con la feria y la fecha en el nombre', async () => {
    mockReportsService.getJurorAssignmentReport.mockResolvedValue({
      edition: {
        id: 3,
        year: 2026,
        semester: 30,
        title: 'Feria Arkad 2026-30',
      },
      rows: [],
    });
    const { res, headers } = fakeResponse();

    await controller.exportJurados(res, 3);

    expect(mockReportsService.getJurorAssignmentReport).toHaveBeenCalledWith(3);
    expect(headers['Content-Type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(headers['Content-Disposition']).toMatch(
      /^attachment; filename="asignacion_jurados_2026-30_\d{4}-\d{2}-\d{2}\.xlsx"; filename\*=UTF-8''asignacion_jurados_2026-30_/,
    );
  });

  it('exportJurados (HU-16) sin asignaciones responde 404 con el mensaje en JSON', async () => {
    mockReportsService.getJurorAssignmentReport.mockRejectedValue(
      new NotFoundException('No hay asignaciones para exportar.'),
    );
    const { res } = fakeResponse();

    await controller.exportJurados(res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'No hay asignaciones para exportar.',
      }),
    );
  });
});
