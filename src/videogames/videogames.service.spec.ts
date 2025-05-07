import { Test, TestingModule } from '@nestjs/testing';
import { VideogamesService } from './videogames.service';

describe('VideogamesService', () => {
  let service: VideogamesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VideogamesService],
    }).compile();

    service = module.get<VideogamesService>(VideogamesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
