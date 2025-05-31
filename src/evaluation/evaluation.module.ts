import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { CriterionModule } from '../criterion/criterion.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, CriterionModule],
  controllers: [EvaluationController],
  providers: [EvaluationService],
})
export class EvaluationModule {}