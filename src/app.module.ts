import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseAuthGuard } from './auth/guards/supabase-auth.guard';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SubjectsModule,
    NrcsModule,
    PendingGamesModule,
    GradedGamesModule,
    CriterionModule,
    ProfessorsModule,
    TeamsModule,
    JurorModule,
    VideogameModule,
    EvaluationModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: SupabaseAuthGuard }],
})
export class AppModule {}
