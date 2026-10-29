import { Test, TestingModule } from '@nestjs/testing';
import { HistoricalsController } from './historicals.controller';
import { HistoricalsService } from './historicals.service';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';

describe('HistoricalsController', () => {
  let controller: HistoricalsController;

  const mockHistoricalsService = {
    getAllHistoricalTeams: jest.fn(),
    getHistoricalTeamsByEdition: jest.fn(),
    getHistoricalMembersByTeam: jest.fn(),
    getHistoricalVideogamesByEdition: jest.fn(),
    createHistoricalEditionDump: jest.fn(),
    getHistoricalTeamsWithScores: jest.fn(),
    updateHistoricalTeam: jest.fn(),
    updateHistoricalMember: jest.fn(),
    updateHistoricalVideogame: jest.fn(),
    removeHistoricalTeam: jest.fn(),
    removeHistoricalMember: jest.fn(),
    removeHistoricalVideogame: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistoricalsController],
      providers: [
        {
          provide: HistoricalsService,
          useValue: mockHistoricalsService,
        },
      ],
    })
      // La autorización (permisos por rol) se prueba aparte en
      // `auth/route-access.spec.ts`; aquí solo se prueba la lógica del controlador.
      .overrideGuard(RolePermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HistoricalsController>(HistoricalsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
