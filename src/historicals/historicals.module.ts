import { Module } from '@nestjs/common';
import { HistoricalsService } from './historicals.service';
import { HistoricalsController } from './historicals.controller';

@Module({
  controllers: [HistoricalsController],
  providers: [HistoricalsService],
  exports: [HistoricalsService],
})
export class HistoricalsModule {}
