import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { EvaluationTrackingQueryDto } from './dto/evaluation-tracking-query.dto';
import { EvaluationTrackingService } from './evaluation-tracking.service';

const trackingExample = {
  editionId: 12,
  date: '2026-11-26',
  generatedAt: '2026-11-26T15:02:10.000Z',
  hours: [8, 9, 10, 11, 12],
  groups: [
    {
      teamId: 41,
      teamCode: 'N2-AYP-07',
      teamName: 'Pixel Pioneers',
      videogame: 'Space Run',
      level: 'N2',
      assignedJurors: 4,
      presentJurors: 3,
      evaluationsReceived: 2,
      evaluationsCounted: 2,
      byHour: [
        { hour: 8, received: 0, counted: 0 },
        { hour: 9, received: 1, counted: 1 },
        { hour: 10, received: 2, counted: 2 },
        { hour: 11, received: 2, counted: 2 },
        { hour: 12, received: 2, counted: 2 },
      ],
      belowMinimumAt11: true,
    },
  ],
};

@ApiTags('Evaluation tracking')
@Controller('evaluation-tracking')
@UseGuards(RolePermissionGuard)
@RequiredService('ViewEvaluationTracking')
export class EvaluationTrackingController {
  constructor(private readonly trackingService: EvaluationTrackingService) {}

  @Get()
  @ApiOperation({
    summary: 'Seguimiento por hora de las evaluaciones de cada grupo (HU-21)',
    description:
      'Grupos de la feria activa con jurados asignados, presentes (check-in), evaluaciones recibidas y las que cuentan (las 3 primeras por hora de envío). `byHour` es acumulado: cuántas tenía el grupo a cada hora (Bogotá). Ordenado de menos a más evaluaciones que cuentan. Solo lectura y sin datos personales.',
  })
  @ApiResponse({ status: 200, schema: { example: trackingExample } })
  @ApiResponse({ status: 400, description: 'Nivel o fecha no válidos' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: 'No hay una edición activa' })
  getTracking(@Query() query: EvaluationTrackingQueryDto) {
    return this.trackingService.getTracking(query);
  }
}
