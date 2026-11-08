import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { EvaluationDraftsController } from './drafts/evaluation-drafts.controller';
import { EvaluationDraftsService } from './drafts/evaluation-drafts.service';
import { CriterionModule } from '../criterion/criterion.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamVerificationModule } from '../team-verification/team-verification.module';

@Module({
  imports: [PrismaModule, CriterionModule, TeamVerificationModule],
  controllers: [EvaluationController, EvaluationDraftsController],
  providers: [EvaluationService, EvaluationDraftsService],
})
export class EvaluationModule {}