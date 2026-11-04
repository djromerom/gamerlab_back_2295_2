import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EvaluationTrackingController } from './evaluation-tracking.controller';
import { EvaluationTrackingService } from './evaluation-tracking.service';

@Module({
  imports: [PrismaModule],
  controllers: [EvaluationTrackingController],
  providers: [EvaluationTrackingService],
  // HU-12 usa el corte de las 10:00 para la alerta de inasistencia.
  exports: [EvaluationTrackingService],
})
export class EvaluationTrackingModule {}
