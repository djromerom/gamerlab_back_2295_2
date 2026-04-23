import { Module } from '@nestjs/common';
import { JurorService } from './juror.service';
import { JurorController } from './juror.controller';
import { AuthModule } from '../auth/auth.module';
import { JurorAssignmentAuditService } from './assignment-audit/juror-assignment-audit.service';

@Module({
  imports: [AuthModule],
  controllers: [JurorController],
  providers: [JurorService, JurorAssignmentAuditService],
})
export class JurorModule {}