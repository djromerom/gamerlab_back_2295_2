import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { AbsenceAlertModule } from 'src/jurors/absence-alert/absence-alert.module';
import { JurorPresenceModule } from 'src/jurors/juror-presence/juror-presence.module';
import { JurorModule } from 'src/jurors/juror/juror.module';
import { SubstituteNoticesModule } from 'src/jurors/substitute-notices/substitute-notices.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PushNotificationsModule } from 'src/push-notifications/push-notifications.module';
import { ContingencyAssignmentService } from './contingency-assignment.service';
import { JurorContingencyController } from './juror-contingency.controller';
import { JurorContingencyService } from './juror-contingency.service';

/** HU-14 (ARK-213): contingencia con suplentes para los grupos en riesgo. */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    // Cronograma de la feria (hora de control, HU-12).
    AbsenceAlertModule,
    // «Posible salida» del jurado (HU-23).
    JurorPresenceModule,
    // Reglas de HU-08 y bitácora de asignaciones.
    JurorModule,
    // Aviso «Te asignaron grupos» (HU-22) y notificación push (HU-37).
    SubstituteNoticesModule,
    PushNotificationsModule,
  ],
  controllers: [JurorContingencyController],
  providers: [JurorContingencyService, ContingencyAssignmentService],
})
export class JurorContingencyModule {}
