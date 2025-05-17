import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('videogame/:id')
  async getReportByVideogame(@Param('id', ParseIntPipe) id: number) {
    return this.reportsService.getEvaluationsByVideogame(id);
  }

  @Get('videojuegoData')
  async getWithMateriaYNRC() {
    return this.reportsService.getVideogamesData();
  }

  @Get('materiaData')
  async getSubjects() {
    return this.reportsService.getSubjects();
}

  @Get('NRCData')
  async getNrcWithSubjectNameAndAverage() {
    return this.reportsService.getNrcWithSubjectNameAndAverage();
}

  @Get('DatosGraficoMateria')
  async getAverageScorePerSubject() {
    return this.reportsService.getSubjectAverageScores();
}

  @Get('JuradosData')
  async getJuradosData() {
    return this.reportsService.getJuradosData();
  }

}