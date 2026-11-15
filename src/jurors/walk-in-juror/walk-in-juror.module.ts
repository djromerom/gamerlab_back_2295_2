import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { AbsenceAlertModule } from 'src/jurors/absence-alert/absence-alert.module';
import { JurorModule } from 'src/jurors/juror/juror.module';
import { SubstituteNoticesModule } from 'src/jurors/substitute-notices/substitute-notices.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PushNotificationsModule } from 'src/push-notifications/push-notifications.module';
import { WalkInAssignmentService } from './walk-in-assignment.service';
import { WalkInJurorController } from './walk-in-juror.controller';
import { WalkInJurorService } from './walk-in-juror.service';

/** HU-24 (ARK-217): alta del jurado de último momento y asignación automática de grupos. */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    // Cronograma de la feria (hora de control, HU-12).
    AbsenceAlertModule,
    // Reglas de HU-08 y bitácora de asignaciones.
    JurorModule,
    // Aviso «Te asignaron grupos» (HU-22) y notificación push (HU-37).
    SubstituteNoticesModule,
    PushNotificationsModule,
  ],
  controllers: [WalkInJurorController],
  providers: [WalkInJurorService, WalkInAssignmentService],
})
export class WalkInJurorModule {}
