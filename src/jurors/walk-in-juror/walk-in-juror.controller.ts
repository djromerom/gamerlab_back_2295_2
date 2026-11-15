import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { ASSIGNMENT_CONFLICT_DOC } from 'src/jurors/juror/assignment-validation/assignment-validation.swagger';
import { AssignWalkInTeamsDto } from './dto/assign-walk-in-teams.dto';
import { CreateWalkInJurorDto } from './dto/create-walk-in-juror.dto';
import { TeamSuggestionQueryDto } from './dto/team-suggestion-query.dto';
import { WalkInAssignmentService } from './walk-in-assignment.service';
import { WalkInJurorService } from './walk-in-juror.service';
import {
  EXISTING_PERSON_EXAMPLE,
  TEAM_SUGGESTION_EXAMPLE,
  WALK_IN_ASSIGNMENT_EXAMPLE,
  WALK_IN_CREATED_EXAMPLE,
} from './walk-in-juror.swagger';

const NOT_A_CANDIDATE_DOC = {
  status: 404,
  description:
    'El jurado no es Suplente Junior confirmado de la edición activa (`code: NOT_A_JUNIOR_SUBSTITUTE`) o no hay edición activa (`code: NO_ACTIVE_EDITION`)',
};

/** HU-24 (ARK-217): jurado de último momento. Solo Administrador (el Staff no tiene el permiso). */
@ApiTags('Walk-in jurors')
@Controller('walk-in-jurors')
@UseGuards(RolePermissionGuard)
@RequiredService('ManageWalkInJurors')
export class WalkInJurorController {
  constructor(
    private readonly walkInJurors: WalkInJurorService,
    private readonly assignments: WalkInAssignmentService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Dar de alta a un jurado que llegó sin estar registrado y marcar su llegada (HU-24)',
    description: `
      Crea la cuenta como **Junior y Suplente**, la inscribe en la edición activa como
      **Confirmado** con la marca \`walkIn\` y registra su **llegada** (manual, con quien la hizo),
      todo en una transacción. Envía el correo para crear la contraseña; si el envío falla, el
      jurado queda creado y se reenvía con \`POST /juror/resend-confirmation\`.

      **Duplicados.** Si el correo ya existe responde 409 \`EMAIL_ALREADY_EXISTS\` con esa persona
      en \`existing\` y no cambia nada: si \`isJurorOfEdition\` es \`true\` y \`checkedInAt\` es
      \`null\`, márcale la llegada con \`POST /juror-checkin/manual\`. Si hay jurados o profesores
      con un nombre parecido responde 409 \`SIMILAR_PEOPLE\` con la lista en \`matches\`; para
      crear igual se reenvía con \`confirmSimilar: true\`.
    `,
  })
  @ApiResponse({ status: 201, schema: { example: WALK_IN_CREATED_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Datos no válidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description: 'No hay edición activa (`code: NO_ACTIVE_EDITION`)',
  })
  @ApiResponse({
    status: 409,
    description:
      '`EMAIL_ALREADY_EXISTS` (trae `existing`) o `SIMILAR_PEOPLE` (trae `matches`)',
    schema: {
      example: {
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message:
          'Ese correo ya es de Laura Gómez Ruiz (Jurado), que es jurado de «ARKAD 2026-30». No se creó nada: marca su llegada.',
        existing: EXISTING_PERSON_EXAMPLE,
      },
    },
  })
  create(
    @Body() dto: CreateWalkInJurorDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.walkInJurors.create(dto, actorUserId);
  }

  @Get(':jurorId/team-suggestion')
  @ApiOperation({
    summary:
      'Proponer grupos al suplente: los del nivel con más jurados faltantes (HU-24)',
    description: `
      No guarda nada. Excluye colegios (N0), equipos sin nivel, sin confirmar, no calificables y
      los que el suplente ya tiene. Elige **un solo nivel**: el que suma más jurados faltantes
      (cada grupo necesita 3); empate, el de más grupos con faltantes; luego, el nivel más bajo.
      Dentro del nivel, primero los grupos a los que más les faltan, hasta \`maxTeams\`.

      Antes de la hora de control del cronograma (11:00) cuentan los jurados **asignados**
      (\`basis: ASSIGNED\`); desde ella, los **presentes**: con llegada registrada o que ya
      evaluaron ese grupo (\`basis: PRESENT\`). Sin cronograma configurado cuentan los asignados.
      Si no hay grupos con faltantes, \`teams\` viene vacía y \`reason: NO_SHORTAGE\`.
    `,
  })
  @ApiResponse({ status: 200, schema: { example: TEAM_SUGGESTION_EXAMPLE } })
  @ApiResponse({ status: 400, description: '`maxTeams` fuera de 1 a 10' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse(NOT_A_CANDIDATE_DOC)
  suggest(
    @Param('jurorId') jurorId: string,
    @Query() query: TeamSuggestionQueryDto,
  ) {
    return this.assignments.suggest(jurorId, query.maxTeams);
  }

  @Post(':jurorId/assignments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Asignar al suplente los grupos confirmados o editados en la lista previa (HU-24)',
    description: `
      **Solo suma:** nadie pierde grupos y las evaluaciones hechas no se tocan. Los grupos que el
      suplente ya tenía se omiten (\`equiposYaAsignados\`). Reglas de HU-08 sobre todos los grupos
      nuevos: un bloqueo responde 400 con su \`code\` (un colegio da \`SCHOOL_REQUIRES_SENIOR\`) y
      no guarda nada; las advertencias responden 409 \`ASSIGNMENT_WARNINGS\` y se guardan
      reenviando con \`confirmWarnings: true\`. Una transacción con los pares, una fila de
      bitácora por grupo y el aviso «Te asignaron grupos» (HU-22); la notificación push sale
      después.
    `,
  })
  @ApiResponse({ status: 200, schema: { example: WALK_IN_ASSIGNMENT_EXAMPLE } })
  @ApiResponse({
    status: 400,
    description:
      'Datos no válidos o bloqueo de HU-08 (`SCHOOL_REQUIRES_SENIOR`, `TEAM_NOT_CONFIRMED`, `TEAM_NOT_GRADABLE`, `EDITION_READ_ONLY`...)',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description: `${NOT_A_CANDIDATE_DOC.description}, o un grupo no existe o está inactivo (\`code: TEAM_NOT_FOUND\`)`,
  })
  @ApiResponse({ status: 409, ...ASSIGNMENT_CONFLICT_DOC })
  assign(
    @Param('jurorId') jurorId: string,
    @Body() dto: AssignWalkInTeamsDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.assignments.assign(jurorId, dto, actorUserId);
  }
}
