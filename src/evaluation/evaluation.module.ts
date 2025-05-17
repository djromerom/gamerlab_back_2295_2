import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EvaluationController],
  providers: [EvaluationService],
})
export class EvaluationModule {}