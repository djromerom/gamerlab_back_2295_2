import { Test, TestingModule } from '@nestjs/testing';
import { NrcsController } from './nrcs.controller';
import { NrcsService } from './nrcs.service';

describe('NrcsController', () => {
  let controller: NrcsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NrcsController],
      providers: [NrcsService],
    }).compile();

    controller = module.get<NrcsController>(NrcsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
