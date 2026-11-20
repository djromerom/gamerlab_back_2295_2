import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { ASSIGNMENT_CONFLICT_DOC } from 'src/jurors/juror/assignment-validation/assignment-validation.swagger';
import { ContingencyAssignmentService } from './contingency-assignment.service';
import { AcceptSubstituteSuggestionsDto } from './dto/accept-substitute-suggestions.dto';
import { RejectSubstituteSuggestionDto } from './dto/reject-substitute-suggestion.dto';
import { UpdateContingencySettingsDto } from './dto/update-contingency-settings.dto';
import { JurorContingencyService } from './juror-contingency.service';

const RISK_RULES =
  'Un jurado cuenta en un grupo si ya lo evaluó; antes de la hora de control (11:00, HU-12) cuentan todos los asignados y desde ella solo los presentes (llegada registrada). Un presente que se retiró (HU-23: «posible salida» y «presencia sin confirmar» a la vez) deja de contar en los grupos que aún no evaluó. Faltantes = mínimo de evaluaciones − contados. Responde a cualquier hora: `fase` y `base` dicen cómo se calculó.';

/** HU-14 (ARK-213): contingencia con suplentes. Todo es del administrador. */
@ApiTags('Juror')
@Controller('juror/contingency')
@UseGuards(RolePermissionGuard)
export class JurorContingencyController {
  constructor(
    private readonly contingency: JurorContingencyService,
    private readonly assignments: ContingencyAssignmentService,
  ) {}

  @Get('groups-at-risk')
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Grupos en riesgo de la edición activa (HU-14)',
    description: `Grupos con menos jurados que cuentan que el mínimo, de más a menos faltantes, con la situación de cada jurado (PRESENT, ABSENT o LEFT). ${RISK_RULES}`,
  })
  @ApiNotFoundResponse({ description: 'No hay edición activa' })
  getGroupsAtRisk() {
    return this.contingency.getGroupsAtRisk();
  }

  @Get('suggestions')
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Sugerencia de suplentes para los grupos en riesgo (HU-14)',
    description: `No guarda nada. Para cada grupo en riesgo propone suplentes (tipo Suplente confirmados de la edición) hasta completar el mínimo, en este orden: mismo nivel, senior si es colegio (en N0 solo seniors), misma categoría que el jurado ausente, menor carga, llegada registrada. Reparte la carga entre grupos. \`alternativas\` trae a los demás suplentes posibles para asignar a mano; un suplente rechazado para el grupo no se vuelve a sugerir ahí (sale en alternativas con \`rechazado: true\`). \`advertencias\` son las de HU-08 si se aceptan los sugeridos. ${RISK_RULES}`,
  })
  @ApiNotFoundResponse({ description: 'No hay edición activa' })
  getSuggestions() {
    return this.contingency.getSuggestions();
  }

  @Post('suggestions/accept')
  @HttpCode(HttpStatus.OK)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Aceptar suplentes sugeridos o elegidos a mano (HU-14)',
    description:
      'Guarda los pares grupo-suplente enviados (un grupo, todos o un suplente de las alternativas). **Solo suma:** nadie pierde grupos, aunque el jurado ausente llegue después, y las evaluaciones no se tocan. Los pares que ya existen se omiten. Reglas de HU-08 sobre todos los pares nuevos: un bloqueo responde 400 con su `code`; las advertencias, 409 `ASSIGNMENT_WARNINGS`, y se guardan reenviando con `confirmWarnings: true`. Una transacción: pares, bitácora (nota «Suplente de contingencia desde módulo admin (HU-14).») y un aviso de HU-22 por suplente. 400 `NOT_A_SUBSTITUTE`, 404 `TEAM_NOT_FOUND`.',
  })
  @ApiOkResponse({ description: 'Resumen por suplente' })
  @ApiBadRequestResponse({
    description: 'Datos inválidos, `NOT_A_SUBSTITUTE` o bloqueo de HU-08',
  })
  @ApiConflictResponse(ASSIGNMENT_CONFLICT_DOC)
  accept(
    @Body() dto: AcceptSubstituteSuggestionsDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.assignments.accept(dto, actorUserId);
  }

  @Post('suggestions/reject')
  @HttpCode(HttpStatus.OK)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Rechazar la sugerencia de un grupo (HU-14)',
    description:
      'Registra quién, cuándo y por qué (`rechazo_sugerencia_suplente`); no cambia asignaciones. Sin `substituteIds` se rechaza toda la sugerencia actual del grupo. Esos suplentes no se vuelven a sugerir para ese grupo y quedan en las alternativas para asignar a mano. 400 `NO_SUGGESTION_TO_REJECT` o `NOT_A_SUBSTITUTE`, 404 `TEAM_NOT_FOUND`.',
  })
  reject(
    @Body() dto: RejectSubstituteSuggestionDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.assignments.reject(dto, actorUserId);
  }

  @Get('settings')
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Parámetros de la contingencia (HU-14)',
    description:
      'Mínimo de evaluaciones por grupo de la edición activa (3 por defecto) y el cronograma de la feria (las horas se cambian con `PUT /absence-alert/schedule`).',
  })
  getSettings() {
    return this.contingency.getSettings();
  }

  @Put('settings')
  @RequiredService('ManageFairSchedule')
  @ApiOperation({
    summary: 'Cambiar el mínimo de evaluaciones por grupo (HU-14)',
    description:
      'Define qué grupos quedan en riesgo y cuántos suplentes se sugieren. No cambia la nota: solo cuentan las 3 primeras evaluaciones (P-10). 404 `EVENT_CONFIGURATION_NOT_FOUND` si la edición activa no tiene configuración.',
  })
  updateSettings(@Body() dto: UpdateContingencySettingsDto) {
    return this.contingency.updateSettings(dto);
  }
}
