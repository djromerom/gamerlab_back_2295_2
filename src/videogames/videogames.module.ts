import { Module } from '@nestjs/common';
import { VideogamesController } from './videogames.controller';
import { VideogamesService } from './videogames.service';
import { PrismaService } from '../prisma/prisma.service';
import { VideogamesGateway } from './videogames.gateway';
import { UploadModule } from '../upload/upload.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [UploadModule, PushNotificationsModule],
  controllers: [VideogamesController],
  providers: [VideogamesService, PrismaService, VideogamesGateway],
})
export class VideogameModule {}
