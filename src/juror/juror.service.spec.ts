import { Test, TestingModule } from '@nestjs/testing';

import { JurorService } from './juror.service';

describe('JurorService', () => {
  let service: JurorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JurorService],
    }).compile();

    service = module.get<JurorService>(JurorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
