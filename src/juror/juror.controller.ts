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
import { ReassignJurorAssignmentDto } from './dto/reassign-juror-assignment.dto';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
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

  @Get('evaluations-assignment')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Asignar evaluaciones automáticamente',
    description: `
      Asigna automáticamente jurados a cada equipo confirmado, agrupando por nivel.
      Los jurados se distribuyen equitativamente entre los equipos del mismo nivel.
      
      **Reglas de asignación:**
      - Los jurados solo pueden evaluar equipos del mismo nivel
      - El nivel se extrae del código del equipo (formato: N<número>-...)
      - Ejemplos de códigos válidos: N0-COLEGIOS-01, N1-AYP-06, N2-AYP2-05, N3-DATOS-08, N4-DATOS2-20
      - Se distribuyen equitativamente los jurados disponibles entre los equipos del mismo nivel
      - El número de jurados por equipo se calcula automáticamente: total_jurados / total_equipos
      - Si hay sobrantes, se distribuyen equitativamente entre los primeros equipos
      
      **Niveles:**
      - N0: Colegios
      - N1: AYP1
      - N2: AYP2
      - N3: DATOS 1, POO
      - N4: DATOS 2
    `,
  })
  @ApiOkResponse({
    description: 'Evaluaciones asignadas correctamente',
    schema: {
      example: {
        message: 'Evaluaciones asignadas correctamente',
        details: [
          'Nivel 0: 2 equipos asignados con 2 jurados cada uno',
          'Nivel 1: 5 equipos asignados (2-3 jurados por equipo, promedio: 2.4)',
          'Nivel 2: 3 equipos asignados con 3 jurados cada uno',
          'Nivel 3: 4 equipos asignados (1-2 jurados por equipo, promedio: 1.5)',
          'Nivel 4: 2 equipos asignados con 2 jurados cada uno',
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'No se encontraron equipos con formato de nivel válido',
    schema: {
      example: {
        message: 'No se encontraron equipos con formato de nivel válido (N<número>-...)',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos para asignar jurados' })
  @ApiInternalServerErrorResponse({ description: 'Error interno del servidor' })
  AsignEvaluations() {
    return this.jurorService.asingEvaluations();
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
    return await this.authService.resendAuthEmailOfType(email, 'VERIFICACION_EMAIL');
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
  assignJurorToTeam(
    @Body() assignDto: AssignJurorToTeamDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.jurorService.assignJurorToTeam(
      assignDto.jurorId,
      assignDto.teamId,
      actorUserId,
    );
  }

  @Patch('assignments/reassign')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  reassignJurorOnTeam(
    @Body() dto: ReassignJurorAssignmentDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.jurorService.reassignJurorOnTeam(
      dto.currentJurorId,
      dto.newJurorId,
      dto.teamId,
      actorUserId,
    );
  }

  @Delete('assignments/all')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  removeAllJurorAssignments(@GetUser('id') actorUserId: string) {
    return this.jurorService.removeAllJurorAssignments(actorUserId);
  }

  @Delete(':id/assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  removeAllAssignmentsFromJuror(
    @Param('id') id: string,
    @GetUser('id') actorUserId: string,
  ) {
    return this.jurorService.removeAllAssignmentsFromJuror(id, actorUserId);
  }

  @Delete('assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  removeJurorFromTeam(
    @Body() assignDto: AssignJurorToTeamDto,
    @GetUser('id') actorUserId: string,
  ) {
    return this.jurorService.removeJurorFromTeam(
      assignDto.jurorId,
      assignDto.teamId,
      actorUserId,
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
    description: 'Devuelve la cantidad de jurados asignados a un equipo y cuántos de ellos ya han calificado el videojuego del equipo',
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
