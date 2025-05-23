import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Res } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Response } from 'express';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import * as ExcelJS from 'exceljs';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

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
      /*worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Nombre', key: 'nombre', width: 30 },
        { header: 'Materia', key: 'materia', width: 25 },
        { header: 'NRC', key: 'nrc', width: 10 },
        { header: 'Promedio', key: 'promedio', width: 12 },
        { header: 'Evaluaciones Completadas', key: 'evaluacionesCompletadas', width: 25 },
        { header: 'Jurados Asignados', key: 'totalJuradosAsignados', width: 20 },
      ];*/

      const columnDefinitions: Partial<ExcelJS.Column>[] = [ // Usar Partial<ExcelJS.Column> para mejor tipado
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Nombre del videojuego', key: 'nombre', width: 30 },
        { header: 'Materia', key: 'materia', width: 25 },
        { header: 'NRC', key: 'nrc', width: 10 },
        { header: 'Promedio', key: 'promedio', width: 12 },
        { header: 'No. Evaluaciones Completadas', key: 'evaluacionesCompletadas', width: 25 },
        { header: 'No. Jurados Asignados', key: 'totalJuradosAsignados', width: 20 },
      ];

      // Agregar criterios como columnas dinámicas
      const criteriosHeaders = new Set<string>();
      data.forEach(item => {
        if (item.criterios && typeof item.criterios === 'object') { // Añadir verificación
          Object.keys(item.criterios).forEach(criterio => {
            criteriosHeaders.add(criterio);
          });
        }
      });

      // Añadir columnas de criterios
      Array.from(criteriosHeaders).sort().forEach(criterio => { // sort() para orden consistente
        columnDefinitions.push({
          header: criterio,
          key: `criterio_${criterio.replace(/\s+/g, '_')}`, // Reemplazar espacios en la key por guion bajo
          width: 15
        });
      });

      worksheet.columns = columnDefinitions;

      // Agregar datos
      data.forEach(item => {
        const rowData: any = { // Usar 'any' o un tipo más específico si defines todas las keys
          id: item.id,
          nombre: item.nombre,
          materia: item.materia,
          nrc: item.nrc,
          promedio: item.promedio,
          evaluacionesCompletadas: item.evaluacionesCompletadas,
          totalJuradosAsignados: item.totalJuradosAsignados,
        };

        if (item.criterios && typeof item.criterios === 'object') { // Añadir verificación
          Object.entries(item.criterios).forEach(([criterioNombre, valor]) => {
            // Asegúrate que la key aquí coincida con la generada para las columnas de criterios
            rowData[`criterio_${criterioNombre.replace(/\s+/g, '_')}`] = valor;
          });
        }
        worksheet.addRow(rowData);
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

      if (!res.writableEnded) { // Verifica si el stream ya ha sido cerrado
        res.end();
      }
    } catch (error) {
      console.error('Error al generar Excel:', error);
      // Evitar enviar otra respuesta si los headers ya fueron enviados (por ejemplo, por workbook.xlsx.write fallando a medias)
      if (!res.headersSent) {
        res.status(500).send('Error al generar el reporte');
      } else if (!res.writableEnded) {
        // Si los headers fueron enviados pero el stream no terminó, intenta cerrar.
        res.end();
      }
    }
  }
}