import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { CertificatesModule } from './certificates/certificates.module';
import { EmailModule } from './email/email.module';
import { EditionsModule } from './editions/editions.module';
import { TestimonialsModule } from './testimonials/testimonials.module';
import { EducationalFocusesModule } from './educational-focuses/educational-focuses.module';
import { HighlightedGamesModule } from './highlighted-games/highlighted-games.module';
import { HistoricalsModule } from './historicals/historicals.module';
import { JurorBadgesModule } from './juror-badges/juror-badges.module';
import { JurorCheckinModule } from './juror-checkin/juror-checkin.module';
import { JurorAttendanceModule } from './juror-attendance/juror-attendance.module';
import { AbsentJurorResponsesModule } from './absent-juror-responses/absent-juror-responses.module';
import { StaffModule } from './staff/staff.module';
import { JurorEditionModule } from './juror-edition/juror-edition.module';
import { EvaluationTrackingModule } from './evaluation-tracking/evaluation-tracking.module';
import { TeamVerificationModule } from './team-verification/team-verification.module';
import { RankingModule } from './ranking/ranking.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Only routes with @PublicThrottle use it; the default below is overridden per route (BG-02).
    // In-memory storage: counters reset on restart and are not shared between replicas (see public-throttle.ts).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    EmailModule,
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
    CertificatesModule,
    EditionsModule,
    TestimonialsModule,
    EducationalFocusesModule,
    TeamVerificationModule,
    RankingModule,
    HighlightedGamesModule,
    HistoricalsModule,
    JurorBadgesModule,
    JurorCheckinModule,
    JurorAttendanceModule,
    AbsentJurorResponsesModule,
    StaffModule,
    JurorEditionModule,
    EvaluationTrackingModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
