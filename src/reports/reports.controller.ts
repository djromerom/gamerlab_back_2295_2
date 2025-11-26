import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Res, UseInterceptors } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Response } from 'express';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { Public } from 'src/auth/decorators/public.decorator';
import * as ExcelJS from 'exceljs';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(600000)
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

      const columnDefinitions: Partial<ExcelJS.Column>[] = [ // Usar Partial<ExcelJS.Column> para mejor tipado
        { header: 'Código del equipo', key: 'teamCode', width: 15 },
        { header: 'Videojuego', key: 'nombre', width: 30 },
        { header: 'Equipo', key: 'teamName', width: 25 },
        { header: 'Integrantes', key: 'integrantes', width: 40 },
        { header: 'Semestre', key: 'semestre', width: 12 },
        { header: 'Materia', key: 'materia', width: 25 },
        { header: 'NRC', key: 'nrc', width: 10 },
        { header: 'Calificación Feria', key: 'promedio', width: 25 },
        { header: 'Calif. J. Junior', key: 'avgJunior', width: 12.5 },
        { header: 'Calif. J. Senior', key: 'avgSenior', width: 12.5 },
        { header: 'Evaluaciones Completadas', key: 'evaluacionesCompletadas', width: 25 },
        { header: 'Jurados Asignados', key: 'totalJuradosAsignados', width: 25 },
        { header: 'Jurados Junior', key: 'juniorCount', width: 13 },
        { header: 'Jurados Senior', key: 'seniorCount', width: 13 },
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

      // Style headers: apply requested pattern fill to all header cells
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true } as any;
        cell.alignment = { horizontal: 'center', vertical: 'middle' } as any;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE5D5FA' },
        } as any;
      });

      // Agregar datos
      data.forEach(item => {
        const rowData: any = { // Usar 'any' o un tipo más específico si defines todas las keys
          teamCode: item.teamCode ?? '',
          nombre: item.nombre,
          teamName: item.teamName ?? '',
          integrantes: item.integrantes ?? '',
          semestre: item.semestre ?? '',
          materia: item.materia,
          nrc: item.nrc,
          promedio: item.promedio,
          avgJunior: (item as any).avgJunior ?? null,
          avgSenior: (item as any).avgSenior ?? null,
          evaluacionesCompletadas: item.evaluacionesCompletadas,
          totalJuradosAsignados: item.totalJuradosAsignados,
          juniorCount: (item as any).juniorCount ?? 0,
          seniorCount: (item as any).seniorCount ?? 0,
        };

        if (item.criterios && typeof item.criterios === 'object') { // Añadir verificación
          Object.entries(item.criterios).forEach(([criterioNombre, valor]) => {
            // Asegúrate que la key aquí coincida con la generada para las columnas de criterios
            rowData[`criterio_${criterioNombre.replace(/\s+/g, '_')}`] = valor;
          });
        }
        worksheet.addRow(rowData);
      });

      // Auto-size and align columns according to content (compute max lens)
      const columnKeys = columnDefinitions.map(c => String(c.key ?? ''));
      const maxLens: number[] = columnKeys.map((k, i) => {
        const headerText = String(columnDefinitions[i].header ?? '');
        return headerText.length;
      });

      worksheet.eachRow((row) => {
        row.eachCell((cell, colNumber) => {
          const v = String(cell.value ?? '');
          if (v.length > (maxLens[colNumber - 1] ?? 0)) maxLens[colNumber - 1] = v.length;
        });
      });

      worksheet.columns.forEach((col, idx) => {
        const calculated = Math.min(Math.max((maxLens[idx] ?? 0) + 1, 7), 40);
        col.width = calculated;
        if (columnKeys[idx] === 'integrantes') {
          col.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' } as any;
        } else {
          col.alignment = { horizontal: 'center', vertical: 'middle' } as any;
        }
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