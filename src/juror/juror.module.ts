import { Module } from '@nestjs/common';
import { JurorService } from './juror.service';
import { JurorController } from './juror.controller';
import { AuthModule } from '../auth/auth.module';
import { JurorAssignmentService } from './assignment-audit/juror-assignment.service';
import { JurorAssignmentAuditService } from './assignment-audit/juror-assignment-audit.service';

@Module({
  imports: [AuthModule],
  controllers: [JurorController],
  providers: [
    JurorService,
    JurorAssignmentService,
    JurorAssignmentAuditService,
  ],
})
export class JurorModule {}