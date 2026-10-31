import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BatchTeamEvaluationDto } from './dto/batch-team-evaluation.dto';
import { ProfessorsController } from './professors.controller';
import { ProfessorsService } from './professors.service';
import { GradingReportExportService } from './grading-report-export.service';
import { GradingGamesService } from './grading-games.service';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExcelExportService } from './excel-export.service';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { Reflector } from '@nestjs/core';
import { CacheService } from '../cache/cache.service';
import { ConfigService } from '@nestjs/config';

type Saved = Awaited<ReturnType<ProfessorsService['updateTeamEvaluation']>>;
const saved = (action: 'created' | 'updated') =>
  ({ action }) as unknown as Saved;

// Caracterización del lote HU-01: POST /professors/team-evaluation/batch
describe('ProfessorsController - team-evaluation/batch (caracterización)', () => {
  let controller: ProfessorsController;
  let service: ProfessorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfessorsController],
      providers: [
        ProfessorsService,
        { provide: AuthService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: ExcelExportService, useValue: {} },
        { provide: GradingReportExportService, useValue: {} },
        { provide: GradingGamesService, useValue: {} },
        { provide: CacheService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: RolePermissionGuard, useValue: { canActivate: () => true } },
        { provide: Reflector, useValue: { get: jest.fn() } },
      ],
    }).compile();
    controller = module.get(ProfessorsController);
    service = module.get(ProfessorsService);
  });

  it('guarda cada fila como evaluación senior con el profesor autenticado', async () => {
    const spy = jest
      .spyOn(service, 'updateTeamEvaluation')
      .mockResolvedValue(saved('updated'));
    const out = await controller.updateTeamEvaluationBatch(
      {
        evaluations: [
          { videogameId: 24, score: 4.5 },
          { videogameId: 25, score: 3 },
        ],
      },
      'prof-1',
    );
    expect(spy).toHaveBeenCalledWith(24, 'prof-1', 4.5, true);
    expect(spy).toHaveBeenCalledWith(25, 'prof-1', 3, true);
    expect(out).toEqual({
      results: [
        { videogameId: 24, success: true },
        { videogameId: 25, success: true },
      ],
    });
  });

  it('un fallo no detiene el resto y conserva el orden; usa el mensaje de la excepción', async () => {
    jest
      .spyOn(service, 'updateTeamEvaluation')
      .mockImplementation((id: number) =>
        id === 25
          ? Promise.reject(
              new BadRequestException(
                'Score must be between 0 and 5, with at most two decimal places',
              ),
            )
          : Promise.resolve(saved('created')),
      );
    const out = await controller.updateTeamEvaluationBatch(
      {
        evaluations: [
          { videogameId: 24, score: 4 },
          { videogameId: 25, score: 9 },
          { videogameId: 26, score: 2 },
        ],
      },
      'prof-1',
    );
    expect(out.results).toEqual([
      { videogameId: 24, success: true },
      {
        videogameId: 25,
        success: false,
        message:
          'Score must be between 0 and 5, with at most two decimal places',
      },
      { videogameId: 26, success: true },
    ]);
  });

  it('videogameId inválido falla la fila sin llamar al servicio de guardado', async () => {
    const spy = jest
      .spyOn(service, 'updateTeamEvaluation')
      .mockResolvedValue(saved('updated'));
    const out = await controller.updateTeamEvaluationBatch(
      {
        evaluations: [
          { videogameId: 0, score: 4 },
          { videogameId: 1.5, score: 4 },
        ],
      },
      'prof-1',
    );
    expect(spy).not.toHaveBeenCalled();
    expect(out.results).toEqual([
      {
        videogameId: 0,
        success: false,
        message: 'videogameId must be a positive integer',
      },
      {
        videogameId: 1.5,
        success: false,
        message: 'videogameId must be a positive integer',
      },
    ]);
  });

  it('error genérico usa su message; sin mensaje usa el texto por defecto', async () => {
    jest
      .spyOn(service, 'updateTeamEvaluation')
      .mockImplementation((id: number) =>
        Promise.reject(
          id === 1 ? new Error('boom') : (undefined as unknown as Error),
        ),
      );
    const out = await controller.updateTeamEvaluationBatch(
      {
        evaluations: [
          { videogameId: 1, score: 1 },
          { videogameId: 2, score: 1 },
        ],
      },
      'p',
    );
    expect(out.results).toEqual([
      { videogameId: 1, success: false, message: 'boom' },
      { videogameId: 2, success: false, message: 'Could not save evaluation' },
    ]);
  });

  it('evaluations que no es arreglo devuelve resultados vacíos', async () => {
    const out = await controller.updateTeamEvaluationBatch(
      { evaluations: undefined } as unknown as BatchTeamEvaluationDto,
      'p',
    );
    expect(out).toEqual({ results: [] });
  });
});
