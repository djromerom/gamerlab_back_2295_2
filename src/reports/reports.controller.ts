import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Res, UseGuards, Inject } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Response } from 'express';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SettingsService } from '../settings/settings.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AppUser } from '../auth/jwt.strategy';
import { ROLE_IDS } from '../auth/constants/roles';
import { Public } from 'src/auth/decorators/public.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { OptionalAdminRoleGuard } from 'src/auth/guards/admin-role.guard';
import { IsAdmin } from 'src/auth/decorators/is-admin.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import * as ExcelJS from 'exceljs';
import { ApiTags, ApiOperation, ApiQuery, ApiOkResponse } from '@nestjs/swagger';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly settingsService: SettingsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) { }

  // Caché de 10 min con el estado de showRanking en la clave: al ocultar el ranking no se
  // sirven notas viejas. El administrador con el ranking oculto ve las notas y no usa la caché pública.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('videojuegoData')
  @ApiOperation({ summary: 'Get videogames with subject and NRC' })
  async getWithMateriaYNRC(@GetUser() user?: AppUser) {
    const showRanking = await this.settingsService.isRankingVisible();
    if (!showRanking && user?.roleId === ROLE_IDS.ADMIN) {
      return this.reportsService.getVideogamesData(user);
    }
    const key = `reports:videojuegoData:showRanking=${showRanking}`;
    const cached = await this.cacheManager.get(key);
    if (cached !== undefined && cached !== null) return cached;
    const data = await this.reportsService.getVideogamesData(user);
    await this.cacheManager.set(key, data, 600000);
    return data;
  }

  @Public()
  @Get('materiaData')
  @ApiOperation({ summary: 'Get active subjects' })
  async getSubjects() {
    return this.reportsService.getSubjects();
  }

  // Sin caché. Con el ranking oculto el promedio va en null salvo para el administrador (ARK-SP1 T29).
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('NRCData')
  @ApiOperation({ summary: 'Get NRCs with average per NRC' })
  async getNrcWithSubjectNameAndAverage(@GetUser() user?: AppUser) {
    return this.reportsService.getNrcWithSubjectNameAndAverage(user);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('DatosGraficoMateria')
  @ApiOperation({ summary: 'Get average score per subject (for charts)' })
  async getAverageScorePerSubject(@GetUser() user?: AppUser) {
    return this.reportsService.getSubjectAverageScores(user);
  }

  // Devuelve correos de jurados: requiere sesión (BG-02).
  // El administrador ve todos; cualquier otro usuario solo los jurados de su propio equipo (página "Mis jurados").
  @Get('JuradosData')
  @UseGuards(OptionalAdminRoleGuard)
  @ApiOperation({ summary: 'Get jurors data (admin: all jurors; team leader: only the jurors of their team)' })
  async getJuradosData(@IsAdmin() isAdmin: boolean, @GetUser('id') userId: string) {
    if (isAdmin) {
      return this.reportsService.getJuradosData();
    }
    return this.reportsService.getJuradosDataForTeamLeader(userId);
  }

  @Get('exportExcel')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportAdminReports')
  @ApiOperation({ summary: 'Export videogame report to Excel' })
  @ApiQuery({ name: 'materia', required: false, description: 'Subject name to filter' })
  @ApiQuery({ name: 'nrc', required: false, description: 'NRC code to filter', type: Number })
  @ApiOkResponse({ description: 'Excel file with the report' })
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

  @Get('exportJurados')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportAdminReports')
  @ApiOperation({ summary: 'Export jurors report to Excel' })
  @ApiOkResponse({ description: 'Excel file with jurors and their status' })
  async exportJurados(
    @Res() res: Response,
  ) {
    try {
      const data = await this.reportsService.getJuradosData();

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Jurados');

      const columns: Partial<ExcelJS.Column>[] = [
        { header: 'Nombre Jurado', key: 'nombre', width: 30 },
        { header: 'Email Jurado', key: 'correo', width: 30 },
        { header: 'Estado', key: 'estado', width: 15 },
        { header: 'Juegos revisados', key: 'revisados', width: 40 },
        { header: 'Juegos pendientes', key: 'pendientes', width: 40 },
      ];

      worksheet.columns = columns;

      // header style
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true } as any;
        cell.alignment = { horizontal: 'left', vertical: 'middle' } as any;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD6EAF8' },
        } as any;
      });

      // Sort jurors: pending first, then confirmed/active, then others
      const statusOrder = (s?: string) => {
        const st = (s ?? '').toLowerCase();
        if (st.includes('pend') || st.includes('pending') || st.includes('pendiente')) return 0;
        if (st.includes('confirm') || st.includes('activo') || st.includes('active') || st.includes('confirmed')) return 1;
        return 2;
      };
      data.sort((a, b) => statusOrder(a.estado) - statusOrder(b.estado));

      data.forEach(item => {
        const asignados = item.videojuegosAsignados || [];
        const revisados = item.videojuegosCompletos || [];
        const pendientes = asignados.filter(a => !revisados.includes(a));

        worksheet.addRow({
          nombre: item.nombre,
          correo: item.correo,
          estado: item.estado,
          revisados: (revisados || []).join(', '),
          pendientes: (pendientes || []).join(', '),
        });
      });

      // Auto-size
      const maxLens: number[] = columns.map(c => String(c.header ?? '').length);
      worksheet.eachRow((row) => {
        row.eachCell((cell, colNumber) => {
          const v = String(cell.value ?? '');
          if (v.length > (maxLens[colNumber - 1] ?? 0)) maxLens[colNumber - 1] = v.length;
        });
      });
      // add autofilter for the header row
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length },
      } as any;

      worksheet.columns.forEach((col, idx) => {
        const calculated = Math.min(Math.max((maxLens[idx] ?? 0) + 2, 18), 80);
        col.width = calculated;
        const key = String(columns[idx].key);
        if (key === 'estado') {
          col.alignment = { horizontal: 'center', vertical: 'middle' } as any;
        } 
      });
      res.setHeader('Content-Disposition', 'attachment; filename=reporte_jurados.xlsx');
      await workbook.xlsx.write(res);
      if (!res.writableEnded) res.end();
    } catch (error) {
      console.error('Error exportJurados:', error);
      if (!res.headersSent) res.status(500).send('Error al generar el reporte de jurados'); else if (!res.writableEnded) res.end();
    }
  }
}