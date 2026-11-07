import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { AbsentJurorResponsesService } from './absent-juror-responses.service';
import { CreateAbsentJurorResponseDto } from './dto/create-absent-juror-response.dto';

const responseExample = {
  id: 12,
  jurorId: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01',
  result: 'ON_THE_WAY',
  estimatedArrivalAt: '2026-11-26T15:30:00.000Z',
  recordedAt: '2026-11-26T15:02:41.000Z',
  recordedBy: {
    id: '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c03',
    name: 'Admin Arkad',
  },
};

@ApiTags('Absent juror responses')
@Controller('absent-juror-responses')
@UseGuards(RolePermissionGuard)
@RequiredService('ManageAbsentJurorResponses')
export class AbsentJurorResponsesController {
  constructor(private readonly responsesService: AbsentJurorResponsesService) {}

  @Post()
  @ApiOperation({
    summary: 'Registra la respuesta sobre un jurado que no ha llegado (HU-13)',
    description:
      'Agrega una fila al historial con hora y autor. Es informativo: no cambia asignaciones ni cobertura. Solo Administrador; el profesor informa fuera del sistema.',
  })
  @ApiResponse({ status: 201, schema: { example: responseExample } })
  @ApiResponse({
    status: 400,
    description: 'Datos no válidos o hora estimada sin `ON_THE_WAY`',
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description:
      'El jurado no es de la edición activa o no hay edición activa (`code: NO_ACTIVE_EDITION`)',
  })
  @ApiResponse({
    status: 409,
    description:
      'El jurado ya tiene su llegada registrada (`code: JUROR_ALREADY_CHECKED_IN`)',
  })
  create(
    @Body() dto: CreateAbsentJurorResponseDto,
    @GetUser('id') recordedById: string,
  ) {
    return this.responsesService.create(dto, recordedById);
  }

  @Get(':jurorId')
  @ApiOperation({
    summary:
      'Historial de respuestas de un jurado en la edición activa (HU-13)',
    description:
      'El registro más reciente primero: `data[0]` es el vigente y `data` viene vacía si no hay registros. Sin correos ni teléfonos.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        edition: { id: 5, title: 'ARKAD 2026-30' },
        juror: {
          id: responseExample.jurorId,
          name: 'Ana Pérez',
          category: 'Senior',
        },
        data: [responseExample],
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description:
      'El jurado no es de la edición activa ni tiene registros en ella, o no hay edición activa (`code: NO_ACTIVE_EDITION`)',
  })
  history(@Param('jurorId') jurorId: string) {
    return this.responsesService.history(jurorId);
  }
}
