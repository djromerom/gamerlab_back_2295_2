import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JurorSurveyController } from './juror-survey.controller';
import { JurorSurveyService } from './juror-survey.service';

/** HU-17 (ARK-183): encuesta de experiencia del jurado. */
@Module({
  imports: [PrismaModule],
  controllers: [JurorSurveyController],
  providers: [JurorSurveyService],
})
export class JurorSurveyModule {}
