import { Module } from '@nestjs/common';
import { JurorService } from './juror.service';
import { JurorController } from './juror.controller';
import { AuthModule } from 'src/auth/auth.module';
import { PushNotificationsModule } from 'src/push-notifications/push-notifications.module';
import { SubstituteNoticesModule } from 'src/jurors/substitute-notices/substitute-notices.module';
import { JurorAssignmentService } from './assignment-audit/juror-assignment.service';
import { JurorAssignmentAuditService } from './assignment-audit/juror-assignment-audit.service';
import { AssignmentValidationService } from './assignment-validation/assignment-validation.service';
import { AutomaticAssignmentController } from './automatic-assignment/automatic-assignment.controller';
import { AutomaticAssignmentService } from './automatic-assignment/automatic-assignment.service';
import { SubstituteAssignmentController } from './substitute-assignment/substitute-assignment.controller';
import { SubstituteAssignmentService } from './substitute-assignment/substitute-assignment.service';

@Module({
  imports: [AuthModule, PushNotificationsModule, SubstituteNoticesModule],
  controllers: [
    JurorController,
    AutomaticAssignmentController,
    SubstituteAssignmentController,
  ],
  providers: [
    JurorService,
    JurorAssignmentService,
    JurorAssignmentAuditService,
    AssignmentValidationService,
    AutomaticAssignmentService,
    SubstituteAssignmentService,
  ],
})
export class JurorModule {}
