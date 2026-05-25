import { Test, TestingModule } from '@nestjs/testing';
import { HistoricalsController } from './historicals.controller';
import { HistoricalsService } from './historicals.service';

describe('HistoricalsController', () => {
  let controller: HistoricalsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistoricalsController],
      providers: [HistoricalsService],
    }).compile();

    controller = module.get<HistoricalsController>(HistoricalsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
