import { Module } from '@nestjs/common';
import { PendingGamesModule } from 'src/pending-games/pending-games.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AssignmentPushNotifier } from './assignment-push-notifier.service';
import { PushNoticesService } from './push-notices.service';
import { PushNotificationsController } from './push-notifications.controller';
import { PushSenderService } from './push-sender.service';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { VapidConfigService } from './vapid-config.service';

@Module({
  imports: [PrismaModule, PendingGamesModule],
  controllers: [PushNotificationsController],
  providers: [
    VapidConfigService,
    PushSenderService,
    PushSubscriptionsService,
    PushNoticesService,
    AssignmentPushNotifier,
  ],
  exports: [PushSenderService, AssignmentPushNotifier],
})
export class PushNotificationsModule {}
