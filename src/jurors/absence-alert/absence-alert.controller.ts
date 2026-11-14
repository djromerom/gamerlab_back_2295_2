import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { EditionIdDto } from 'src/jurors/juror-edition/dto/edition-id.dto';
import { AbsenceAlertService } from './absence-alert.service';
import { AbsencePanelQueryDto } from './dto/absence-panel-query.dto';
import { SaveFairScheduleDto } from './dto/save-fair-schedule.dto';
import { FairScheduleService } from './fair-schedule.service';

const edition = {
  id: 5,
  title: 'ARKAD 2026-30',
  status: 'ACTIVE',
  writable: true,
};
const schedule = {
  fairDate: '2026-11-26',
  startTime: '08:00',
  alertTime: '10:00',
  controlTime: '11:00',
  closeTime: '12:00',
};
const juror = {
  jurorId: '7a1c2b3d-4e5f-4a6b-8c9d-0e1f2a3b4c02',
  name: 'Luis Gómez',
  category: 'Junior',
  isProfessor: false,
  type: 'OFFICIAL',
  state: 'NO_CHECK_IN',
  checkedInAt: null,
};
const group = {
  teamId: 41,
  teamCode: 'N2-AYP-07',
  teamName: 'Pixel Pioneers',
  videogame: 'Space Run',
  level: 'N2',
  assignedJurors: 4,
  presentJurors: 3,
  evaluationsCounted: 1,
  missingEvaluations: 2,
};
const alertExample = {
  edition,
  schedule,
  phase: 'ALERT',
  alertActive: true,
  generatedAt: '2026-11-26T15:02:10.000Z',
  totals: { present: 42, missing: 71, total: 113 },
  missingJurors: [juror],
  groups: [group],
};
const panelExample = {
  edition,
  phase: 'ALERT',
  generatedAt: '2026-11-26T15:02:10.000Z',
  totals: { present: 42, missing: 71, total: 113 },
  data: [{ ...group, jurors: [{ ...juror, hasEvaluated: false }] }],
};

@ApiTags('Absence alert')
@Controller('absence-alert')
@UseGuards(RolePermissionGuard)
export class AbsenceAlertController {
  constructor(
    private readonly alertService: AbsenceAlertService,
    private readonly scheduleService: FairScheduleService,
  ) {}

  @Get()
  @RequiredService('ViewAbsenceAlert')
  @ApiOperation({
    summary: 'Alerta temprana de inasistencia de la edición activa (HU-12)',
    description:
      'Fase del cronograma, contador de jurados que faltan y, desde la hora de alerta, la lista de jurados sin check-in y los grupos con más evaluaciones por recibir (de más a menos). Desde la hora de control los jurados sin check-in salen como `ABSENT`. Solo lectura y sin correos ni teléfonos.',
  })
  @ApiResponse({ status: 200, schema: { example: alertExample } })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description: 'No hay una edición activa (`code: NO_ACTIVE_EDITION`)',
  })
  getAlert() {
    return this.alertService.getAlert();
  }

  @Get('panel')
  @RequiredService('ViewAbsenceAlert')
  @ApiOperation({
    summary: 'Panel de seguimiento con la asistencia de cada jurado (HU-12)',
    description:
      'Grupos de la edición activa con sus jurados asignados, su estado de asistencia y si ya evaluaron. Se puede filtrar por estado. Solo lectura y sin correos: los profesores lo ven (P-16).',
  })
  @ApiResponse({ status: 200, schema: { example: panelExample } })
  @ApiResponse({ status: 400, description: 'Filtro no válido' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description: 'No hay una edición activa (`code: NO_ACTIVE_EDITION`)',
  })
  getPanel(@Query() query: AbsencePanelQueryDto) {
    return this.alertService.getPanel(query);
  }

  @Get('schedule')
  @RequiredService('ManageFairSchedule')
  @ApiOperation({
    summary: 'Cronograma de la feria de una edición (HU-12)',
    description:
      'Por defecto, la edición activa. Si no se ha configurado, `configured` es false, `fairDate` es null y las horas son 8:00, 10:00, 11:00 y 12:00. `edition.writable` indica si se puede modificar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { edition, configured: true, schedule } },
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: 'La edición no existe' })
  getSchedule(@Query() query: EditionIdDto) {
    return this.scheduleService.get(query.editionId);
  }

  @Put('schedule')
  @RequiredService('ManageFairSchedule')
  @ApiOperation({
    summary: 'Configurar el cronograma de la feria de una edición (HU-12)',
    description:
      'Crea o reemplaza el cronograma completo. Horas de Bogotá en formato HH:mm y en orden: inicio, alerta, control y cierre. Las ediciones archivadas o terminadas son de solo lectura.',
  })
  @ApiBody({ type: SaveFairScheduleDto })
  @ApiResponse({
    status: 200,
    schema: { example: { edition, configured: true, schedule } },
  })
  @ApiResponse({
    status: 400,
    description:
      'Fecha u horas no válidas, o edición de solo lectura (`code: EDITION_READ_ONLY`)',
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: 'La edición no existe' })
  saveSchedule(
    @Body() dto: SaveFairScheduleDto,
    @GetUser('id') userId: string,
  ) {
    return this.scheduleService.save(dto, userId);
  }
}
