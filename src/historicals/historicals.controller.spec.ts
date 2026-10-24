import { Test, TestingModule } from '@nestjs/testing';
import { HistoricalsController } from './historicals.controller';
import { HistoricalsService } from './historicals.service';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';

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
      .overrideGuard(AdminRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HistoricalsController>(HistoricalsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
