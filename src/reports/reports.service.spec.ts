import { Test, TestingModule } from '@nestjs/testing';
<<<<<<<< HEAD:src/reports/reports.service.spec.ts
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
========
import { JurorService } from './juror.service';

describe('JurorService', () => {
  let service: JurorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JurorService],
    }).compile();

    service = module.get<JurorService>(JurorService);
>>>>>>>> origin/dev:src/juror/juror.service.spec.ts
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
