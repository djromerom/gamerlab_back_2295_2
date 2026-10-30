import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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

  @Post('with-details')
  @UseGuards(RolePermissionGuard)
  @RequiredService('Create Evaluation')
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
  async createBatchEvaluations(
    @Body() batchPayload: BatchEvaluationDto,
    @GetUser() user: AppUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.evaluationService.createBatchEvaluations(user.id, batchPayload, idempotencyKey);
  }
}
