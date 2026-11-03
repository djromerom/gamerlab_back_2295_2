import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { GetUser } from '../../auth/decorators/get-user.decorator';
import { RequiredService } from '../../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../../auth/guards/role-permission.guard';
import {
  AutoAssignmentConfirmDto,
  AutoAssignmentPreviewDto,
} from '../dto/automatic-assignment.dto';
import { AutomaticAssignmentService } from './automatic-assignment.service';
import {
  AUTO_ASSIGNMENT_OUTDATED_DOC,
  AUTO_ASSIGNMENT_PREVIEW_EXAMPLE,
  AUTO_ASSIGNMENT_RULES_DOC,
} from './automatic-assignment.swagger';

/** HU-07 (ARK-114): asignación automática con vista previa y confirmación. */
@ApiTags('Juror')
@Controller('juror/automatic-assignment')
@UseGuards(RolePermissionGuard)
@RequiredService('AssignJurors')
export class AutomaticAssignmentController {
  constructor(private readonly service: AutomaticAssignmentService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Vista previa de la asignación automática (no guarda)',
    description: `
      Calcula la asignación automática sobre la edición activa (o \`editionId\`
      para simular con ediciones pasadas) y devuelve la distribución, la
      cobertura y las alertas. No guarda nada.
      ${AUTO_ASSIGNMENT_RULES_DOC}
    `,
  })
  @ApiOkResponse({
    description: 'Plan calculado',
    schema: { example: AUTO_ASSIGNMENT_PREVIEW_EXAMPLE },
  })
  @ApiBadRequestResponse({
    description: 'No hay equipos confirmados o jurados oficiales en la edición',
  })
  @ApiNotFoundResponse({ description: 'No hay edición activa o no existe' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'Sin permisos' })
  preview(@Body() dto: AutoAssignmentPreviewDto) {
    return this.service.preview(dto);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar y guardar la asignación automática',
    description: `
      Recibe \`assignments\` de la vista previa, vuelve a calcular el plan sobre
      la edición activa y, si es el mismo, lo guarda en una sola transacción con
      bitácora ("Asignación automática (HU-07)."). Solo agrega jurados: no
      quita ninguna asignación existente (P-21). Si el plan cambió responde 409
      \`AUTO_ASSIGNMENT_OUTDATED\` y no guarda nada. Si falla al guardar, se
      revierte todo.
    `,
  })
  @ApiOkResponse({ description: 'Asignaciones guardadas' })
  @ApiConflictResponse(AUTO_ASSIGNMENT_OUTDATED_DOC)
  @ApiBadRequestResponse({ description: 'Datos inválidos o edición sin datos' })
  @ApiNotFoundResponse({ description: 'No hay edición activa' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'Sin permisos' })
  @ApiInternalServerErrorResponse({
    description: 'Error al guardar: se revirtió todo',
  })
  confirm(
    @Body() dto: AutoAssignmentConfirmDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.service.confirm(dto, actorUserId);
  }
}
