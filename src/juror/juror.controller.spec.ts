import { Test, TestingModule } from '@nestjs/testing';
import { JurorController } from './juror.controller';
import { JurorService } from './juror.service';

describe('JurorController', () => {
  let controller: JurorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JurorController],
      providers: [JurorService],
    }).compile();

    controller = module.get<JurorController>(JurorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
