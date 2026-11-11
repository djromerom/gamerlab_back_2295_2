import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JurorAttendanceController } from './juror-attendance.controller';
import { JurorAttendanceService } from './juror-attendance.service';

@Module({
  imports: [PrismaModule],
  controllers: [JurorAttendanceController],
  providers: [JurorAttendanceService],
  // HU-12 reutiliza las filas de asistencia para la alerta de inasistencia.
  exports: [JurorAttendanceService],
})
export class JurorAttendanceModule {}
