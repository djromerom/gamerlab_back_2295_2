import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { CriterionModule } from '../criterion/criterion.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamVerificationModule } from '../team-verification/team-verification.module';

@Module({
  imports: [PrismaModule, CriterionModule, TeamVerificationModule],
  controllers: [EvaluationController],
  providers: [EvaluationService],
})
export class EvaluationModule {}