import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  
  @Get('videogame/:id')
  async getReportByVideogame(@Param('id', ParseIntPipe) id: number) {
    return this.reportsService.getEvaluationsByVideogame(id);
  }

  @Public()
  @Get('videojuegoData')
  async getWithMateriaYNRC() {
    return this.reportsService.getVideogamesData();
  }

  @Public()
  @Get('materiaData')
  async getSubjects() {
    return this.reportsService.getSubjects();
}

  @Public()
  @Get('NRCData')
  async getNrcWithSubjectNameAndAverage() {
    return this.reportsService.getNrcWithSubjectNameAndAverage();
}

  @Public()
  @Get('DatosGraficoMateria')
  async getAverageScorePerSubject() {
    return this.reportsService.getSubjectAverageScores();
}

  @Public()
  @Get('JuradosData')
  async getJuradosData() {
    return this.reportsService.getJuradosData();
  }

}