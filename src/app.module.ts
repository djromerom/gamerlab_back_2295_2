import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { SubjectsModule } from './subjects/subjects.module';
import { NrcsModule } from './nrcs/nrcs.module';
import { PendingGamesModule } from './pending-games/pg.module';
import { GradedGamesModule } from './graded-games/gg.module';
import { VideogameModule } from './videogames/videogames.module';
import { CriterionModule } from './criterion/criterion.module';
import { ProfessorsModule } from './professors/professors.module';
import { TeamsModule } from './teams/teams.module';
import { JurorModule } from './juror/juror.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { ReportsModule } from './reports/reports.module';
import { CacheModule } from './cache/cache.module';
import { StudentsModule } from './students/students.module';
import { UploadModule } from './upload/upload.module';
import { SettingsModule } from './settings/settings.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    EmailModule, // Add EmailModule to make email endpoints available
    SubjectsModule,
    NrcsModule,
    PendingGamesModule,
    GradedGamesModule,
    CriterionModule,
    ProfessorsModule,
    TeamsModule,
    JurorModule,
    VideogameModule,
    ReportsModule,
    EvaluationModule,
    CacheModule,
    StudentsModule,
    UploadModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
