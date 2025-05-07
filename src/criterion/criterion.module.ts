import { Module } from '@nestjs/common';
import { CriterionService } from './criterion.service';
import { CriterionController } from './criterion.controller';

@Module({
  controllers: [CriterionController],
  providers: [CriterionService],
})
export class CriterionModule {}
