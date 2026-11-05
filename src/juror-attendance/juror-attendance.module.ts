import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JurorAttendanceController } from './juror-attendance.controller';
import { JurorAttendanceService } from './juror-attendance.service';

@Module({
  imports: [PrismaModule],
  controllers: [JurorAttendanceController],
  providers: [JurorAttendanceService],
})
export class JurorAttendanceModule {}
