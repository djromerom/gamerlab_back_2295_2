import { BadRequestException, Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { AppUser } from 'src/auth/jwt.strategy';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { BatchEvaluationDto } from './dto/batchEvaluation.dto';
import { CreateEvaluationDto } from './dto/createEvaluation.dto';
import { EvaluationService } from './evaluation.service';
@ApiTags('Evaluation')
@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Public()
  @Get('progress')
  @ApiOperation({
    summary: 'Progreso de evaluación de la edición',
    description:
      'completed = evaluaciones con puntaje de jurados actualmente asignados; assigned = asignaciones vigentes (jurados activos). completed <= assigned. Sin editionId usa la edición activa.',
  })
  @ApiQuery({ name: 'editionId', required: false, type: Number })
  async getProgress(@Query('editionId') editionId?: string) {
    let id: number | undefined;
    if (editionId !== undefined && editionId !== '') {
      id = Number(editionId);
      if (!Number.isInteger(id) || id <= 0) {
        throw new BadRequestException('editionId debe ser un entero positivo');
      }
    }
    return this.evaluationService.getEvaluationProgressForEdition(id);
  }

  @Post('with-details')
  @UseGuards(RolePermissionGuard)
  @RequiredService('Create Evaluation')
  @ApiResponse({
    status: 409,
    description:
      'El jurado no registró su llegada en la mesa (`code: JUROR_NOT_CHECKED_IN`, BG-71). El administrador puede registrarla por búsqueda manual en el check-in.',
  })
  async createEvaluationWithDetails(
    @Body() evaluationPayload: CreateEvaluationDto,
    @GetUser() user: AppUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.evaluationService.createEvaluationWithDetails(
      user.id,
      evaluationPayload,
      idempotencyKey,
    );
  }

  // Modificacion: Se ha agregado este Endpoint para guardar multiples evaluaciones en una sola
  @Post('batch')
  @UseGuards(RolePermissionGuard)
  @RequiredService('Create Evaluation')
  @ApiOperation({
    summary: 'Guardar múltiples evaluaciones en lote',
    description:
      'Permite al jurado calificar varios videojuegos simultáneamente. Cada evaluación puede tener puntajes diferentes en los criterios.',
  })
  @ApiBody({
    type: BatchEvaluationDto,
    description:
      'Array de evaluaciones a guardar. Cada una contiene videogameId, date, comments y details (array de puntajes por criterio).',
  })
  @ApiResponse({
    status: 201,
    description:
      'Evaluaciones procesadas. El cuerpo incluye un reporte de cuáles fueron exitosas y cuáles fallaron.',
  })
  @ApiResponse({
    status: 403,
    description: 'Las evaluaciones no están habilitadas en este momento.',
  })
  @ApiResponse({
    status: 409,
    description:
      'El jurado no registró su llegada en la mesa (`code: JUROR_NOT_CHECKED_IN`, BG-71). Responde 409 de toda la petición y no guarda ninguna fila.',
  })
  async createBatchEvaluations(
    @Body() batchPayload: BatchEvaluationDto,
    @GetUser() user: AppUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.evaluationService.createBatchEvaluations(user.id, batchPayload, idempotencyKey);
  }
}
