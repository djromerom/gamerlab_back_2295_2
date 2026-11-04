import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Delete,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { omitPassword } from '../common/utils/omit-password';

import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiQuery,
} from '@nestjs/swagger';

import { JurorService } from './juror.service';
import { JurorAssignmentService } from './assignment-audit/juror-assignment.service';

import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { AssignJurorToTeamDto } from './dto/assign-juror-to-team.dto';
import { ReassignJurorAssignmentDto } from './dto/reassign-juror-assignment.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AppUser } from '../auth/jwt.strategy';
import { ROLE_IDS } from '../auth/constants/roles';
import { AuthService } from '../auth/auth.service';

import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { editionIdQuery } from '../editions/list-edition';
import { PaginatedResult } from '../common/types/paginated-result.type';

import { JurorListItem } from './types/juror-list-item.type';
import {
  ASSIGNMENT_CONFLICT_DOC,
  ASSIGNMENT_RULES_DOC,
} from './assignment-validation/assignment-validation.swagger';

@ApiTags('Juror')
@Controller('juror')
export class JurorController {
  constructor(
    private readonly jurorService: JurorService,
    private readonly jurorAssignmentService: JurorAssignmentService,
    private readonly authService: AuthService,
  ) {}

  // ─── Automatic assignment ────────────────────────────────────────────────────

  @Get('evaluations-assignment')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Asignar evaluaciones automáticamente',
    description: `
      Asigna automáticamente jurados a cada equipo confirmado, agrupando por nivel.
      Los jurados se distribuyen equitativamente entre los equipos del mismo nivel.

      **Reglas de asignación:**
      - Los jurados solo pueden evaluar equipos del mismo nivel.
      - El nivel se extrae del código del equipo, formato N<número>-...
      - Ejemplos: N0-COLEGIOS-01, N1-AYP-06, N2-AYP2-05, N3-DATOS-08, N4-DATOS2-20.

      **Niveles:**
      - N0: Colegios.
      - N1: AYP1.
      - N2: AYP2.
      - N3: DATOS 1, POO.
      - N4: DATOS 2.
    `,
  })
  @ApiOkResponse({ description: 'Evaluaciones asignadas correctamente' })
  @ApiBadRequestResponse({
    description: 'No se encontraron equipos con formato de nivel válido',
  })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos para asignar jurados' })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  AsignEvaluations() {
    return this.jurorService.asingEvaluations();
  }

  // ─── CRUD Juror ──────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('CreateJuror')
  @ApiOperation({ summary: 'Crear jurado' })
  create(@Body() dto: CreateJurorDto) {
    return this.jurorService.create(dto);
  }

  @Post('resend-confirmation')
  @UseGuards(RolePermissionGuard)
  @RequiredService('SendEmail')
  @ApiOperation({ summary: 'Reenviar correo de confirmación' })
  async resendConfirmation(@Body('email') email: string) {
    return this.authService.resendAuthEmailOfType(
      email,
      'VERIFICACION_EMAIL',
    );
  }

  @Get('evaluators')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  @ApiOperation({ summary: 'Lista de evaluadores con sus equipos asignados' })
  @ApiQuery({
    name: 'editionId',
    required: false,
    type: Number,
    description:
      'ARK-132: equipos de esa edición. Por defecto, la edición activa (sin edición activa, lista vacía). 404 si la edición no existe.',
  })
  getEvaluatorsWithTeams(@Query('editionId') editionIdParam?: string) {
    return this.jurorService.getEvaluatorsWithTeams(
      editionIdQuery(editionIdParam),
    );
  }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  @ApiOperation({ summary: 'Listar todos los jurados paginados' })
  @ApiQuery({
    name: 'editionId',
    required: false,
    type: Number,
    description:
      'ARK-132: edición de los conteos de evaluados y pendientes. Por defecto, la edición activa (sin edición activa, en cero). 404 si la edición no existe.',
  })
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('editionId') editionIdParam?: string,
  ): Promise<PaginatedResult<JurorListItem>> {
    const { includeInactive, limit, page } = query;
    return this.jurorService.findAll(
      includeInactive,
      limit,
      page,
      editionIdQuery(editionIdParam),
    );
  }

  // ─── Manual assignment ───────────────────────────────────────────────────────

  @Post('assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Asignar manualmente un jurado/profesor a un equipo',
    description: `
      Asigna manualmente un evaluador a un equipo (reglas de HU-08).
      ${ASSIGNMENT_RULES_DOC}
    `,
  })
  @ApiOkResponse({ description: 'Jurado asignado correctamente' })
  @ApiBadRequestResponse({
    description: 'Bloqueo: rol, nivel ilegible o jurado no senior en colegios',
  })
  @ApiConflictResponse(ASSIGNMENT_CONFLICT_DOC)
  @ApiNotFoundResponse({ description: 'Jurado o equipo no encontrado' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'Sin permisos' })
  assignJurorToTeam(
    @Body() dto: AssignJurorToTeamDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.jurorAssignmentService.assign(
      dto.jurorId,
      dto.teamId,
      actorUserId,
      dto.confirmWarnings,
    );
  }

  @Patch('assignments/reassign')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Reasignar un jurado por otro en un equipo',
    description: `
      Reemplaza al jurado actual por uno nuevo en el equipo indicado.
      Se aplican al nuevo jurado las mismas reglas que al asignar (HU-08).
      ${ASSIGNMENT_RULES_DOC}
    `,
  })
  @ApiOkResponse({ description: 'Jurado reasignado correctamente' })
  @ApiBadRequestResponse({
    description: 'Bloqueo: rol, nivel ilegible o jurado no senior en colegios',
  })
  @ApiConflictResponse(ASSIGNMENT_CONFLICT_DOC)
  @ApiNotFoundResponse({ description: 'Jurado o equipo no encontrado' })
  reassignJurorOnTeam(
    @Body() dto: ReassignJurorAssignmentDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.jurorAssignmentService.reassign(
      dto.currentJurorId,
      dto.newJurorId,
      dto.teamId,
      actorUserId,
      dto.confirmWarnings,
    );
  }

  @Delete('assignments/all')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiOperation({ summary: 'Eliminar todas las asignaciones de evaluadores' })
  removeAllJurorAssignments(@GetUser('id') actorUserId: string) {
    return this.jurorAssignmentService.unassignAll(actorUserId);
  }

  @Delete('assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Desasignar un jurado de un equipo específico',
    description:
      'Si el grupo queda con menos de 3 jurados responde 409 ASSIGNMENT_WARNINGS (HU-08); con `confirmWarnings: true` desasigna igual.',
  })
  @ApiConflictResponse(ASSIGNMENT_CONFLICT_DOC)
  removeJurorFromTeam(
    @Body() dto: AssignJurorToTeamDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.jurorAssignmentService.unassign(
      dto.jurorId,
      dto.teamId,
      actorUserId,
      dto.confirmWarnings,
    );
  }

  @Delete(':id/assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiOperation({ summary: 'Eliminar todas las asignaciones de un jurado' })
  removeAllAssignmentsFromJuror(
    @Param('id') id: string,
    @GetUser('id') actorUserId: string,
  ) {
    return this.jurorAssignmentService.unassignAllFromEvaluator(
      id,
      actorUserId,
    );
  }

  // ─── Audit log ───────────────────────────────────────────────────────────────

  @Get('assignments/audit')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Historial de cambios manuales de asignación',
    description:
      'Devuelve el log de auditoría de asignaciones, desasignaciones y reasignaciones manuales.',
  })
  @ApiQuery({ name: 'jurorId', required: false, type: String })
  @ApiQuery({ name: 'teamId', required: false, type: Number })
  @ApiQuery({
    name: 'action',
    required: false,
    enum: [
      'ASSIGN',
      'UNASSIGN',
      'REASSIGN',
      'UNASSIGN_ALL',
      'UNASSIGN_ALL_FROM_EVALUATOR',
    ],
  })
  @ApiQuery({ name: 'actorUserId', required: false, type: String })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'Fecha inicial en formato ISO',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'Fecha final en formato ISO',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Log de auditoría paginado' })
  getAssignmentAuditLog(@Query() query: AuditLogQueryDto) {
    return this.jurorAssignmentService.getAuditLog({
      jurorId: query.jurorId,
      teamId: query.teamId,
      action: query.action,
      actorUserId: query.actorUserId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  // ─── Evaluation tracking ─────────────────────────────────────────────────────

  @Get('evaluation-tracking')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  @ApiOperation({
    summary: 'Seguimiento de evaluaciones por equipo',
    description:
      'Indica cuántos jurados asignados ya evaluaron y cuáles siguen pendientes. Soporta filtros por equipo o jurado.',
  })
  @ApiQuery({ name: 'teamId', required: false, type: Number })
  @ApiQuery({ name: 'jurorId', required: false, type: String })
  @ApiQuery({
    name: 'editionId',
    required: false,
    type: Number,
    description: 'Edición a consultar (por defecto la activa). Las demás son historial de solo lectura.',
  })
  @ApiOkResponse({ description: 'Lista de equipos con seguimiento de evaluación' })
  getEvaluationTracking(
    @Query('teamId') teamId?: string,
    @Query('jurorId') jurorId?: string,
    @Query('editionId') editionIdParam?: string,
  ) {
    const teamIdNumber = teamId ? parseInt(teamId, 10) : undefined;

    if (teamId && isNaN(teamIdNumber!)) {
      throw new BadRequestException('teamId debe ser un número entero válido');
    }

    return this.jurorAssignmentService.getEvaluationTracking(
      teamIdNumber,
      jurorId,
      editionIdQuery(editionIdParam),
    );
  }

  // ─── Team-level queries ──────────────────────────────────────────────────────

  @Get('teams/:teamId/evaluation-stats')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ViewTeamEvaluationStats')
  @ApiOperation({
    summary: 'Obtener estadísticas de evaluación de un equipo',
    description:
      'Devuelve la cantidad de jurados asignados a un equipo y cuántos ya calificaron el videojuego.',
  })
  @ApiOkResponse({
    description: 'Estadísticas de evaluación del equipo',
    schema: {
      example: {
        totalJurorsAssigned: 3,
        jurorsWhoEvaluated: 2,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'ID de equipo inválido' })
  @ApiNotFoundResponse({ description: 'Equipo no encontrado' })
  async getTeamEvaluationStats(
    @Param('teamId') teamId: string,
    @GetUser() user: AppUser,
  ) {
    const teamIdNumber = parseInt(teamId, 10);

    if (isNaN(teamIdNumber)) {
      throw new BadRequestException('ID de equipo inválido');
    }

    await this.jurorService.assertCanViewTeamEvaluationStats(
      user,
      teamIdNumber,
    );

    return this.jurorService.getTeamEvaluationStats(teamIdNumber);
  }

  @Get('teams/:teamId/jurors-status')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  @ApiOperation({
    summary: 'Obtener estado de evaluación de los jurados de un equipo',
    description:
      'Devuelve los jurados asignados a un equipo e indica cuáles ya calificaron y cuáles siguen pendientes. Solo el Administrador recibe el correo de cada jurado.',
  })
  @ApiOkResponse({
    description:
      'Estado de evaluación de jurados del equipo (`email` solo para el Administrador)',
    schema: {
      example: {
        equipo: {
          id: 1,
          nombre: 'Equipo Alpha',
          videojuego: 'Juego Alpha',
        },
        jurados: [
          {
            id: 'juror-senior',
            nombre: 'Juror Senior',
            email: 'jurorsenior@uninorte.edu.co',
            yaCalifico: true,
            estadoEvaluacion: 'CALIFICADO',
          },
          {
            id: 'juror-junior',
            nombre: 'Juror Junior',
            email: 'jurorjunior@uninorte.edu.co',
            yaCalifico: false,
            estadoEvaluacion: 'PENDIENTE',
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'ID de equipo inválido' })
  @ApiNotFoundResponse({ description: 'Equipo no encontrado' })
  getTeamJurorsEvaluationStatus(
    @Param('teamId') teamId: string,
    @GetUser() user: AppUser,
  ) {
    const teamIdNumber = parseInt(teamId, 10);

    if (isNaN(teamIdNumber)) {
      throw new BadRequestException('ID de equipo inválido');
    }

    // ARK-110: el correo del jurado solo lo ve el Administrador
    return this.jurorService.getTeamJurorsEvaluationStatus(
      teamIdNumber,
      user?.roleId === ROLE_IDS.ADMIN,
    );
  }

  @Get(':id/teams')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  @ApiOperation({ summary: 'Equipos asignados a un jurado específico' })
  @ApiQuery({
    name: 'editionId',
    required: false,
    type: Number,
    description:
      'ARK-132: equipos de esa edición. Por defecto, la edición activa (sin edición activa, lista vacía). 404 si la edición no existe.',
  })
  getTeamsAssignedToJuror(
    @Param('id') id: string,
    @Query('editionId') editionIdParam?: string,
  ) {
    return this.jurorService.getTeamsAssignedToJuror(
      id,
      editionIdQuery(editionIdParam),
    );
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetJuror')
  @ApiOperation({ summary: 'Obtener jurado por ID' })
  async findOne(@Param('id') id: string) {
    return omitPassword(await this.jurorService.findOne(id));
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateJuror')
  @ApiOperation({ summary: 'Actualizar datos de un jurado' })
  update(@Param('id') id: string, @Body() dto: UpdateJurorDto) {
    return this.jurorService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteJurror')
  @ApiOperation({ summary: 'Eliminar jurado' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async softdelete(@Param('id') id: string): Promise<void> {
    await this.jurorService.remove(id);
  }
}