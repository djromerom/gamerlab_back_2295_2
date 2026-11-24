import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Res, UseGuards, HttpException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Response } from 'express';
import { AppUser } from '../auth/jwt.strategy';
import { Public } from 'src/auth/decorators/public.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { OptionalAdminRoleGuard } from 'src/auth/guards/admin-role.guard';
import { IsAdmin } from 'src/auth/decorators/is-admin.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import * as ExcelJS from 'exceljs';
import { ApiTags, ApiOperation, ApiQuery, ApiOkResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import { ExcelExportService } from '../professors/excel-export.service';
import { buildJurorAssignmentFileName, buildJurorAssignmentWorkbook } from './juror-assignment-export';
import { editionIdQuery } from '../editions/list-edition';

/** ARK-135 (BG-22): todos los reportes son de una edición; por defecto la activa. */
const EDITION_QUERY_DESCRIPTION =
  'Edición del reporte; por defecto la activa. Las demás se consultan como historial. 400 si no es un entero positivo, 404 si no existe.';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
  ) { }

  // BG-67 (ARK-268): videojuegoData, NRCData y DatosGraficoMateria traen integrantes, notas,
  // promedios junior/senior y el promedio por NRC. Solo las usa /estadisticas (Administrador):
  // requieren sesión y ExportAdminReports. Sin sesión 401; con otro rol 403.
  @Get('videojuegoData')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportAdminReports')
  @ApiOperation({ summary: 'Get videogames with subject and NRC (administrador)' })
  @ApiQuery({ name: 'editionId', required: false, type: Number, description: EDITION_QUERY_DESCRIPTION })
  async getWithMateriaYNRC(
    @GetUser() user: AppUser,
    @Query('editionId') editionIdParam?: string,
  ) {
    return this.reportsService.getVideogamesData(user, editionIdQuery(editionIdParam));
  }

  @Public()
  @Get('materiaData')
  @ApiOperation({ summary: 'Get active subjects' })
  async getSubjects() {
    return this.reportsService.getSubjects();
  }

  @Get('NRCData')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportAdminReports')
  @ApiOperation({ summary: 'Get NRCs with average per NRC (administrador)' })
  @ApiQuery({ name: 'editionId', required: false, type: Number, description: EDITION_QUERY_DESCRIPTION })
  async getNrcWithSubjectNameAndAverage(
    @GetUser() user: AppUser,
    @Query('editionId') editionIdParam?: string,
  ) {
    return this.reportsService.getNrcWithSubjectNameAndAverage(
      user,
      editionIdQuery(editionIdParam),
    );
  }

  @Get('DatosGraficoMateria')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportAdminReports')
  @ApiOperation({ summary: 'Get average score per subject, for charts (administrador)' })
  @ApiQuery({ name: 'editionId', required: false, type: Number, description: EDITION_QUERY_DESCRIPTION })
  async getAverageScorePerSubject(
    @GetUser() user: AppUser,
    @Query('editionId') editionIdParam?: string,
  ) {
    return this.reportsService.getSubjectAverageScores(
      user,
      editionIdQuery(editionIdParam),
    );
  }

  // Devuelve correos de jurados: requiere sesión (BG-02).
  // El administrador ve todos; cualquier otro usuario solo los jurados de su propio equipo (página "Mis jurados").
  @Get('JuradosData')
  @UseGuards(OptionalAdminRoleGuard)
  @ApiOperation({ summary: 'Get jurors data (admin: all jurors; team leader or active member: only the jurors of their team)' })
  @ApiQuery({
    name: 'editionId',
    required: false,
    type: Number,
    description: `Solo administrador. ${EDITION_QUERY_DESCRIPTION} El líder siempre ve los jurados de su equipo de la edición activa.`,
  })
  async getJuradosData(
    @IsAdmin() isAdmin: boolean,
    @GetUser('id') userId: string,
    @Query('editionId') editionIdParam?: string,
    @GetUser('email') email?: string,
  ) {
    if (isAdmin) {
      return this.reportsService.getJuradosData(editionIdQuery(editionIdParam));
    }
    // El líder o un integrante activo ven los jurados de su equipo
    return this.reportsService.getJuradosDataForTeamLeader(userId, email);
  }

  @Get('exportExcel')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportAdminReports')
  @ApiOperation({ summary: 'Export videogame report to Excel' })
  @ApiQuery({ name: 'materia', required: false, description: 'Subject name to filter' })
  @ApiQuery({ name: 'nrc', required: false, description: 'NRC code to filter', type: Number })
  @ApiQuery({ name: 'editionId', required: false, type: Number, description: EDITION_QUERY_DESCRIPTION })
  @ApiOkResponse({ description: 'Excel file with the report' })
  async exportToExcel(
    @Res() res: Response,
    @Query('materia') materia?: string,
    @Query('nrc') nrc?: number,
    @Query('editionId') editionIdParam?: string,
  ) {
    // Fuera del try: un editionId inválido es 400, no el 500 genérico del Excel
    const editionId = editionIdQuery(editionIdParam);
    try {
      // Obtener los datos filtrados
      const data = await this.reportsService.getVideogamesDataFilter(materia, nrc, editionId);

      // Crear el libro de Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Videojuegos');

      const columnDefinitions: Partial<ExcelJS.Column>[] = [ // Usar Partial<ExcelJS.Column> para mejor tipado
        { header: 'TeamCode', key: 'teamCode', width: 15 },
        { header: 'Videojuego', key: 'nombre', width: 30 },
        { header: 'Equipo', key: 'teamName', width: 25 },
        { header: 'Integrantes', key: 'integrantes', width: 40 },
        { header: 'Semestre', key: 'semestre', width: 12 },
        { header: 'Materia', key: 'materia', width: 25 },
        { header: 'NRC', key: 'nrc', width: 10 },
        { header: 'Calificación Feria', key: 'promedio', width: 25 },
        { header: 'Calif. J. Junior', key: 'avgJunior', width: 12.5 },
        { header: 'Calif. J. Senior', key: 'avgSenior', width: 12.5 },
        { header: 'Eval. Completas', key: 'evaluacionesCompletadas', width: 25 },
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
        cell.alignment = { horizontal: 'left', vertical: 'middle' } as any;
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
        const calculated = Math.min(Math.max((maxLens[idx] ?? 0) + 1, 12), 40);
        col.width = calculated;
        if (columnKeys[idx] === 'integrantes' || columnKeys[idx] === 'TeamCode'|| columnKeys[idx] === 'equipo' || columnKeys[idx] === 'videojuego') {
          col.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' } as any;
        } else {
          col.alignment = { horizontal: 'left', vertical: 'middle' } as any;
        }
      });

      // add autofilter for the header row (so clients can filter columns)
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: worksheet.columns.length },
      } as any;

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
      // ARK-135: una edición que no existe responde su 404, no el 500 genérico
      if (error instanceof HttpException && !res.headersSent) {
        res.status(error.getStatus()).json(error.getResponse());
        return;
      }
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

  // HU-16 (ARK-108): asignación de jurados de la edición (por defecto la activa) para enviarla a Rocío.
  // Solo administrador: ExportAdminReports no está concedido a ningún otro rol (BG-01).
  @Get('exportJurados')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportAdminReports')
  @ApiOperation({
    summary: 'Export the juror assignment of an edition to Excel',
    description:
      'Una fila por jurado de la edición (BG-40: jurorsOfEdition, confirmados y profesores con NRC activo): estado en la edición, categoría, tipo (oficial o suplente) de la edición, niveles y grupos asignados, revisados y pendientes. ' +
      'Nombre: asignacion_jurados_<año>-<semestre>_<fecha>.xlsx. 404 "No hay asignaciones para exportar." si la edición no tiene asignaciones.',
  })
  @ApiQuery({ name: 'editionId', required: false, type: Number, description: 'Edición; por defecto la activa' })
  @ApiOkResponse({ description: 'Excel file with the juror assignment' })
  @ApiNotFoundResponse({ description: 'No hay edición activa, no existe la edición o no hay asignaciones' })
  async exportJurados(
    @Res() res: Response,
    @Query('editionId', new ParseIntPipe({ optional: true })) editionId?: number,
  ) {
    try {
      const { edition, rows } = await this.reportsService.getJurorAssignmentReport(editionId);
      const workbook = buildJurorAssignmentWorkbook(rows, edition.title);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        ExcelExportService.buildContentDisposition(buildJurorAssignmentFileName(edition)),
      );
      await workbook.xlsx.write(res);
      if (!res.writableEnded) res.end();
    } catch (error) {
      if (error instanceof HttpException && !res.headersSent) {
        res.status(error.getStatus()).json(error.getResponse());
        return;
      }
      console.error('Error exportJurados:', error);
      if (!res.headersSent) res.status(500).send('Error al generar el reporte de jurados'); else if (!res.writableEnded) res.end();
    }
  }
}
