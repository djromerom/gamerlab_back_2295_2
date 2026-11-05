import { Module } from '@nestjs/common';
import { JurorService } from './juror.service';
import { JurorController } from './juror.controller';
import { AuthModule } from '../auth/auth.module';
import { JurorAssignmentService } from './assignment-audit/juror-assignment.service';
import { JurorAssignmentAuditService } from './assignment-audit/juror-assignment-audit.service';
import { AssignmentValidationService } from './assignment-validation/assignment-validation.service';
import { AutomaticAssignmentController } from './automatic-assignment/automatic-assignment.controller';
import { AutomaticAssignmentService } from './automatic-assignment/automatic-assignment.service';

@Module({
  imports: [AuthModule],
  controllers: [JurorController, AutomaticAssignmentController],
  providers: [
    JurorService,
    JurorAssignmentService,
    JurorAssignmentAuditService,
    AssignmentValidationService,
    AutomaticAssignmentService,
  ],
})
export class JurorModule {}
