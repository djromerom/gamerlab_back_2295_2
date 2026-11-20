import { Module } from '@nestjs/common';
import { EvaluationTrackingModule } from 'src/evaluation-tracking/evaluation-tracking.module';
import { JurorAttendanceModule } from 'src/jurors/juror-attendance/juror-attendance.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AbsenceAlertController } from './absence-alert.controller';
import { AbsenceAlertService } from './absence-alert.service';
import { FairScheduleService } from './fair-schedule.service';

@Module({
  imports: [PrismaModule, JurorAttendanceModule, EvaluationTrackingModule],
  controllers: [AbsenceAlertController],
  providers: [AbsenceAlertService, FairScheduleService],
  // HU-13 y HU-14 usan `listAbsentJurors`; la liberación de notas puede leer la hora de cierre.
  exports: [AbsenceAlertService, FairScheduleService],
})
export class AbsenceAlertModule {}
