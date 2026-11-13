/* eslint-disable prettier/prettier */
// src/teams/teams.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TeamsService } from './services/teams.service';
import { TeamsController } from './controllers/teams.controller';
import { TeamGradableController } from './controllers/team-gradable.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TeamRepository } from './repositories/team.repository';
import { RecaptchaService } from './services/recaptcha.service'
import { TeamGradableService } from './services/team-gradable.service';
import { ConfigModule } from '@nestjs/config';
import { SettingsModule } from '../settings/settings.module';
import { UploadModule } from '../upload/upload.module';
import { RankingModule } from '../ranking/ranking.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [
    PrismaModule, 
    AuthModule, 
    HttpModule,
    ConfigModule,
    SettingsModule,
    UploadModule,
    RankingModule,
    PushNotificationsModule,
  ],
  controllers: [TeamsController, TeamGradableController],
  providers: [
    TeamsService,
    TeamRepository,
    RecaptchaService,
    TeamGradableService,
  ],
})
export class TeamsModule {}