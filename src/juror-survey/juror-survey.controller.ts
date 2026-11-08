import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { ExcelExportService } from '../professors/excel-export.service';
import { AnswerJurorSurveyDto } from './dto/answer-juror-survey.dto';
import {
  buildSurveyFileName,
  buildSurveyWorkbook,
} from './juror-survey-export';
import { JurorSurveyService } from './juror-survey.service';

/**
 * HU-17 (ARK-183): encuesta de experiencia del jurado.
 * - Jurado y Profesor (`AnswerJurorSurvey`): ver si está disponible y responderla una vez.
 * - Solo Administrador (`ViewJurorSurveyResults`): resumen y Excel.
 */
@ApiTags('Juror survey')
@Controller('juror-survey')
@UseGuards(RolePermissionGuard)
export class JurorSurveyController {
  private readonly logger = new Logger(JurorSurveyController.name);

  constructor(private readonly survey: JurorSurveyService) {}

  @Get('status')
  @RequiredService('AnswerJurorSurvey')
  @ApiOperation({
    summary: '¿Mostrar la encuesta? (edición activa)',
    description:
      '`available: true` cuando el jurado envió las evaluaciones de todos sus grupos asignados (los borradores no cuentan) y no la ha respondido. `reason`: NO_ACTIVE_EDITION, NOT_EDITION_JUROR, NO_ASSIGNED_TEAMS, PENDING_EVALUATIONS o ALREADY_ANSWERED. Si la omite, sigue disponible: el front puede volver a consultar.',
  })
  status(@GetUser('id') userId: string) {
    return this.survey.status(userId);
  }

  @Post()
  @RequiredService('AnswerJurorSurvey')
  @ApiOperation({
    summary: 'Responder la encuesta',
    description:
      'Los 6 campos de 1 a 5 son obligatorios; `comments` es opcional (hasta 1000 caracteres). Una sola vez por jurado y edición.',
  })
  @ApiForbiddenResponse({
    description:
      '`code: SURVEY_NOT_AVAILABLE` con `reason` (aún no termina de evaluar, no es jurado de la edición...).',
  })
  @ApiConflictResponse({ description: '`code: SURVEY_ALREADY_ANSWERED`.' })
  answer(@GetUser('id') userId: string, @Body() dto: AnswerJurorSurveyDto) {
    return this.survey.answer(userId, dto);
  }

  @Get('summary')
  @RequiredService('ViewJurorSurveyResults')
  @ApiQuery({ name: 'editionId', required: false, type: Number })
  @ApiOperation({
    summary: 'Resumen de la encuesta (solo Administrador)',
    description:
      'Totales (respuestas, jurados que terminaron de evaluar, jurados de la edición), promedio y distribución por campo, y comentarios con el jurado. Sin `editionId` usa la edición activa.',
  })
  summary(
    @Query('editionId', new ParseIntPipe({ optional: true }))
    editionId?: number,
  ) {
    return this.survey.summary(editionId);
  }

  @Get('export')
  @RequiredService('ViewJurorSurveyResults')
  @ApiQuery({ name: 'editionId', required: false, type: Number })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOperation({
    summary: 'Excel de la encuesta (solo Administrador)',
    description:
      'Hojas «Respuestas» (una fila por jurado) y «Resumen». Sin `editionId` usa la edición activa.',
  })
  async export(
    @Res() res: Response,
    @Query('editionId', new ParseIntPipe({ optional: true }))
    editionId?: number,
  ) {
    const { edition, rows } = await this.survey.responses(editionId);
    const summary = await this.survey.summary(edition.id);
    try {
      const workbook = buildSurveyWorkbook(rows, summary);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        ExcelExportService.buildContentDisposition(
          buildSurveyFileName(edition),
        ),
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      this.logger.error(`Excel de la encuesta: ${(error as Error)?.message}`);
      throw new InternalServerErrorException(
        'No se pudo generar el archivo Excel.',
      );
    }
  }
}
