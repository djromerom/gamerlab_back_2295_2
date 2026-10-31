import { Module } from '@nestjs/common';
import { HistoricalsService } from './historicals.service';
import { HistoricalsController } from './historicals.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [HistoricalsController],
  providers: [HistoricalsService],
  exports: [HistoricalsService],
})
export class HistoricalsModule {}
