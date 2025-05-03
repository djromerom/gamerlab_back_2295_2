import { Test, TestingModule } from '@nestjs/testing';
import { NrcsService } from './nrcs.service';

describe('NrcsService', () => {
  let service: NrcsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NrcsService],
    }).compile();

    service = module.get<NrcsService>(NrcsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
