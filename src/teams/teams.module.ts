/* eslint-disable prettier/prettier */
// src/teams/teams.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TeamsService } from './services/teams.service';
import { TeamsController } from './controllers/teams.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TeamRepository } from './repositories/team.repository';
import { RecaptchaService } from './services/recaptcha.service'
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    PrismaModule, 
    AuthModule, 
    HttpModule,
    ConfigModule
  ],
  controllers: [TeamsController],
  providers: [
    TeamsService,
    TeamRepository,
    RecaptchaService
  ],
})
export class TeamsModule {}