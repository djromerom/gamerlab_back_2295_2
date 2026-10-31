import { Module } from '@nestjs/common';
import { ProfessorsService } from './professors.service';
import { ProfessorsController } from './professors.controller';
import { AuthModule } from 'src/auth/auth.module';
import { ExcelExportService } from './excel-export.service';
import { GradingReportExportService } from './grading-report-export.service';
import { GradingGamesService } from './grading-games.service';
import { ProfessorPanelQueryService } from './professor-panel-query.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfessorsController],
  providers: [
    ProfessorsService,
    ExcelExportService,
    ProfessorPanelQueryService,
    GradingReportExportService,
    GradingGamesService,
  ],
})
export class ProfessorsModule {}
