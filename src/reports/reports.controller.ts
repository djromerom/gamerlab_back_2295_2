import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import * as ExcelJS from 'exceljs';

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

  @Get('videojuegoDataWithFilter')
  async getWithMateriaYNRCFilter(
    @Query('materia') materia?: string,
    @Query('nrc') nrc?: number
  ) {
    return this.reportsService.getVideogamesDataFilter(materia, nrc);
  }

  @Get('exportExcel')
  async exportToExcel(
    @Res() res: Response,
    @Query('materia') materia?: string,
    @Query('nrc') nrc?: number,
  ) {
    try {
      // Obtener los datos filtrados
      const data = await this.reportsService.getVideogamesDataFilter(materia, nrc);
      
      // Crear el libro de Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Videojuegos');
      
      // Definir cabeceras
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Nombre', key: 'nombre', width: 30 },
        { header: 'Materia', key: 'materia', width: 25 },
        { header: 'NRC', key: 'nrc', width: 10 },
        { header: 'Promedio', key: 'promedio', width: 12 },
        { header: 'Evaluaciones Completadas', key: 'evaluacionesCompletadas', width: 25 },
        { header: 'Jurados Asignados', key: 'totalJuradosAsignados', width: 20 },
      ];

      // Agregar criterios como columnas dinámicas
      const criteriosHeaders = new Set<string>();
      data.forEach(item => {
        Object.keys(item.criterios).forEach(criterio => {
          criteriosHeaders.add(criterio);
        });
      });

      // Añadir columnas de criterios
      Array.from(criteriosHeaders).forEach(criterio => {
        worksheet.columns.push({
          header: criterio,
          key: `criterio_${criterio}`,
          width: 15
        });
      });

      // Agregar datos
      data.forEach(item => {
        const row: any = {
          id: item.id,
          nombre: item.nombre,
          materia: item.materia,
          nrc: item.nrc,
          promedio: item.promedio,
          evaluacionesCompletadas: item.evaluacionesCompletadas,
          totalJuradosAsignados: item.totalJuradosAsignados,
        };

        // Agregar puntajes de criterios
        Object.entries(item.criterios).forEach(([criterio, valor]) => {
          row[`criterio_${criterio}`] = valor;
        });

        worksheet.addRow(row);
      });

      // Configurar la respuesta
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=reporte_videojuegos.xlsx'
      );

      // Enviar el archivo
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error al generar Excel:', error);
      res.status(500).send('Error al generar el reporte');
    }
  }

  @Get('materiaData')
  async getSubjects() {
    return this.reportsService.getSubjects();
  }

  @Get('NRCData')
  async getNrcWithSubjectName() {
    return this.reportsService.getNrcWithSubjectName();
  }

  @Get('DatosGraficoMateria')
  async getAverageScorePerSubject() {
    return this.reportsService.getSubjectAverageScores();
  }
  
}