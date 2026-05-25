import { Test, TestingModule } from '@nestjs/testing';
import { HistoricalsService } from './historicals.service';

describe('HistoricalsService', () => {
  let service: HistoricalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HistoricalsService],
    }).compile();

    service = module.get<HistoricalsService>(HistoricalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
