import { Test, TestingModule } from '@nestjs/testing';
import { VideogamesController } from './videogames.controller';
import { VideogamesService } from './videogames.service';

describe('VideogamesController', () => {
  let controller: VideogamesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideogamesController],
      providers: [VideogamesService],
    }).compile();

    controller = module.get<VideogamesController>(VideogamesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
