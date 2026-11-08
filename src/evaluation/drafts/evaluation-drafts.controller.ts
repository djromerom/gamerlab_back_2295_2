import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { SaveEvaluationDraftDto } from './dto/save-evaluation-draft.dto';
import { EvaluationDraftsService } from './evaluation-drafts.service';

/**
 * HU-18 (ARK-104): borradores de evaluación. Mismo permiso que calificar (`Create Evaluation`);
 * cada jurado solo ve y toca los suyos (el id sale de la sesión, nunca del body).
 */
@ApiTags('Evaluation drafts')
@Controller('evaluation/drafts')
@UseGuards(RolePermissionGuard)
@RequiredService('Create Evaluation')
export class EvaluationDraftsController {
  constructor(private readonly drafts: EvaluationDraftsService) {}

  @Get()
  @ApiOperation({
    summary: 'Mis borradores de la edición activa',
    description:
      'Más reciente primero. `status`: PENDING (se puede continuar), ALREADY_SUBMITTED (ya enviaste la evaluación: ofrecer descartar), NOT_ASSIGNED (la asignación cambió o el juego ya no se puede calificar; `blockedReason` dice por qué: ofrecer descartar). Funciona aunque las evaluaciones estén cerradas.',
  })
  list(@GetUser('id') jurorId: string) {
    return this.drafts.list(jurorId);
  }

  @Get(':videogameId')
  @ApiParam({ name: 'videogameId', type: Number })
  @ApiOperation({
    summary: 'El borrador de un juego, para reanudar',
    description: 'Responde `{ draft: null }` si no hay borrador activo.',
  })
  findOne(
    @GetUser('id') jurorId: string,
    @Param('videogameId', ParseIntPipe) videogameId: number,
  ) {
    return this.drafts.findOne(jurorId, videogameId);
  }

  @Put(':videogameId')
  @ApiParam({ name: 'videogameId', type: Number })
  @ApiOperation({
    summary: 'Guardar el borrador (autoguardado)',
    description:
      'Reemplaza lo guardado con lo que se envía. Acepta notas incompletas (cada una de 0 a 5, máximo 2 decimales, criterio activo y sin repetir). No exige el código del grupo (HU-19) y funciona con las evaluaciones cerradas: eso se exige al enviar. Mandar la `version` de la última respuesta (0 si no hay borrador). No cuenta como evaluación hasta enviarla por /evaluation/with-details o /evaluation/batch, que lo cierran.',
  })
  @ApiOkResponse({
    description: 'El borrador guardado, con la nueva `version`.',
  })
  @ApiForbiddenResponse({
    description:
      'El juego no se puede calificar (no asignado, otra edición, colegios sin senior).',
  })
  @ApiConflictResponse({
    description:
      '`code: DRAFT_VERSION_CONFLICT` (trae `draft` con la versión actual) o `code: EVALUATION_ALREADY_SUBMITTED`.',
  })
  save(
    @GetUser('id') jurorId: string,
    @Param('videogameId', ParseIntPipe) videogameId: number,
    @Body() dto: SaveEvaluationDraftDto,
  ) {
    return this.drafts.save(jurorId, videogameId, dto);
  }

  @Delete(':videogameId')
  @ApiParam({ name: 'videogameId', type: Number })
  @ApiOperation({
    summary: 'Descartar el borrador',
    description:
      'Borrado lógico. `{ discarded: false }` si no había borrador activo.',
  })
  discard(
    @GetUser('id') jurorId: string,
    @Param('videogameId', ParseIntPipe) videogameId: number,
  ) {
    return this.drafts.discard(jurorId, videogameId);
  }
}
