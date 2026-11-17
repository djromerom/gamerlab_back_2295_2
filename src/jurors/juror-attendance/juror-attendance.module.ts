import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JurorArrivalAnnulmentService } from './juror-arrival-annulment.service';
import { JurorAttendanceController } from './juror-attendance.controller';
import { JurorAttendanceService } from './juror-attendance.service';

@Module({
  imports: [PrismaModule],
  controllers: [JurorAttendanceController],
  providers: [JurorAttendanceService, JurorArrivalAnnulmentService],
  // HU-12 reutiliza las filas de asistencia para la alerta de inasistencia.
  exports: [JurorAttendanceService],
})
export class JurorAttendanceModule {}
