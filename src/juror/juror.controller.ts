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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { JurorService } from './juror.service';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { AssignJurorToTeamDto } from './dto/assign-juror-to-team.dto';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator'; // Por ejemplo este modulo podemos usarlo en UseGUard para indicar que requiere de este modulo o incluso en Required Service, pero no es estrictamente necesario, igual es buena practica
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { JurorListItem } from './types/juror-list-item.type';
import { AuthService } from '../auth/auth.service';

@ApiTags('Juror')
@Controller('juror')
export class JurorController {
  constructor(
    private readonly jurorService: JurorService,
    private readonly authService: AuthService,
  ) { }

  // [MODIFICADO]: Documentación Swagger actualizada con mapeo correcto Senior/Junior
  // [ANTES]: La documentación indicaba reglas incorrectas sobre roles
  @Get('evaluations-assignment')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Asignar evaluadores automáticamente a equipos',
    description: `
      Asigna automáticamente evaluadores a cada equipo confirmado, agrupando por nivel.
      
      **Mapeo de roles:**
      - Profesores = Senior → pueden evaluar TODOS los niveles (N0-N4)
      - Jurados = Junior → solo pueden evaluar niveles universitarios (N1-N4)
      
      **Reglas de asignación (obligatorias):**
      - Los equipos de colegios (N0) SOLO pueden ser evaluados por Profesores (Senior)
      - Los equipos universitarios (N1-N4) pueden ser evaluados por Profesores (Senior) y Jurados (Junior)
      
      **Criterios de mejor esfuerzo:**
      - Cada equipo recibe exactamente 3 evaluadores (si es posible)
      - Cada evaluador no debería tener más de 5 equipos asignados (si es posible)
      - Los evaluadores califican equipos del mismo nivel/semestre (si es posible)
      - Si no hay suficientes del mismo nivel, se usan niveles cercanos
      
      **Niveles:**
      - N0: Colegios (solo Senior/Profesores)
      - N1-N4: Universitarios (Senior + Junior)
    `,
  })
  @ApiOkResponse({
    description: 'Evaluaciones asignadas correctamente',
    schema: {
      example: {
        message: 'Asignación automática completada correctamente.',
        resumen: [
          'Colegios (N0): 2 equipos × 3 evaluadores c/u',
          'Universitarios N1: 5 equipos, 2-3 evaluadores (promedio: 2.8)',
          'Carga de evaluadores: promedio 3.2, máximo 5 equipos (12 evaluadores activos)',
        ],
        advertencias: [],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'No se encontraron equipos con formato de nivel válido',
  })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({
    description: 'No tiene permisos para asignar jurados',
  })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  AsignEvaluations() {
    return this.jurorService.autoAssignJurors();
  }

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('CreateJuror')
  create(@Body() dto: CreateJurorDto) {
    return this.jurorService.create(dto);
  }

  @Post('resend-confirmation')
  @UseGuards(RolePermissionGuard)
  @RequiredService('SendEmail')
  async resendConfirmation(@Body('email') email: string) {
    return await this.authService.resendAuthEmailOfType(
      email,
      'VERIFICACION_EMAIL',
    );
  }

  @Get('evaluators')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  getEvaluatorsWithTeams() {
    return this.jurorService.getEvaluatorsWithTeams();
  }

  @Post('assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  assignJurorToTeam(@Body() assignDto: AssignJurorToTeamDto) {
    return this.jurorService.assignJurorToTeam(
      assignDto.jurorId,
      assignDto.teamId,
    );
  }

  @Delete('assignments/all')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  removeAllJurorAssignments() {
    return this.jurorService.removeAllJurorAssignments();
  }

  @Delete(':id/assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  removeAllAssignmentsFromJuror(@Param('id') id: string) {
    return this.jurorService.removeAllAssignmentsFromJuror(id);
  }

  @Delete('assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  removeJurorFromTeam(@Body() assignDto: AssignJurorToTeamDto) {
    return this.jurorService.removeJurorFromTeam(
      assignDto.jurorId,
      assignDto.teamId,
    );
  }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<JurorListItem>> {
    const { includeInactive, limit, page } = query;
    return this.jurorService.findAll(includeInactive, limit, page);
  }

  @Get('teams/:teamId/evaluation-stats')
  @ApiOperation({
    summary: 'Obtener estadísticas de evaluación de un equipo',
    description:
      'Devuelve la cantidad de jurados asignados a un equipo y cuántos de ellos ya han calificado el videojuego del equipo',
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
  getTeamEvaluationStats(@Param('teamId') teamId: string) {
    const teamIdNumber = parseInt(teamId, 10);
    if (isNaN(teamIdNumber)) {
      throw new BadRequestException('ID de equipo inválido');
    }
    return this.jurorService.getTeamEvaluationStats(teamIdNumber);
  }

  @Get(':id/teams')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  getTeamsAssignedToJuror(@Param('id') id: string) {
    return this.jurorService.getTeamsAssignedToJuror(id);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetJuror')
  findOne(@Param('id') id: string) {
    return this.jurorService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateJuror')
  update(@Param('id') id: string, @Body() dto: UpdateJurorDto) {
    return this.jurorService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteJurror')
  softdelete(@Param('id') id: string) {
    return this.jurorService.remove(id);
  }
}