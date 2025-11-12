import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JurorService } from './juror.service';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { AssignJurorToTeamDto } from './dto/assign-juror-to-team.dto';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { JurorListItem } from './types/juror-list-item.type';
import { AuthService } from '../auth/auth.service';

@ApiTags('Jurors')
@Controller('juror')
export class JurorController {
  constructor(
    private readonly jurorService: JurorService,
    private readonly authService: AuthService,
  ) {}

  @Get('evaluations-assignment')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
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
    return await this.authService.resendEmailOfType(email, 'CONFIRMATION');
  }

  @Get('evaluators')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar jurados activos con sus equipos asignados',
    description:
      'Devuelve los jurados activos y confirmados junto a los equipos y videojuegos que tienen asignados, más la cantidad total de asignaciones.',
  })
  @ApiOkResponse({
    description: 'Lista de jurados con sus equipos asignados',
    schema: {
      example: [
        {
          id: '1f5c2a5b-29a5-4e9b-8c3c-222222222222',
          nombre: 'Carlos Pérez',
          tipo: 'Jurado',
          email: 'carlos.perez@example.com',
          equiposAsignados: [
            { id: 12, nombre: 'Pixel Ninjas', videojuego: 'Galaxy Runner' },
            { id: 18, nombre: 'Code Warriors', videojuego: 'Brain Maze' },
          ],
          cantidadEquipos: 2,
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Token faltante o inválido' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene permiso para listar jurados' })
  getEvaluatorsWithTeams() {
    return this.jurorService.getEvaluatorsWithTeams();
  }

  @Post('assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Asignar manualmente un jurado a un equipo',
    description: 'Permite asignar un jurado activo a un equipo que tenga menos de tres jurados registrados.',
  })
  @ApiBody({
    type: AssignJurorToTeamDto,
    schema: {
      example: {
        jurorId: '1f5c2a5b-29a5-4e9b-8c3c-222222222222',
        teamId: 12,
      },
    },
  })
  @ApiOkResponse({
    description: 'Jurado asignado correctamente al equipo',
    schema: {
      example: {
        message: 'Jurado asignado correctamente al equipo',
        equipo: {
          id: 12,
          nombre: 'Pixel Ninjas',
          videojuego: 'Galaxy Runner',
          juradosAsignados: [
            {
              id: '1f5c2a5b-29a5-4e9b-8c3c-222222222222',
              nombre: 'Carlos Pérez',
              email: 'carlos.perez@example.com',
            },
          ],
          cantidadJurados: 1,
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Datos inválidos o el usuario no es jurado / el equipo ya tiene tres jurados' })
  @ApiConflictResponse({ description: 'El jurado ya está asignado a ese equipo' })
  @ApiNotFoundResponse({ description: 'Jurado o equipo no encontrado' })
  @ApiUnauthorizedResponse({ description: 'Token faltante o inválido' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene permiso para asignar jurados' })
  assignJurorToTeam(@Body() assignDto: AssignJurorToTeamDto) {
    return this.jurorService.assignJurorToTeam(assignDto.jurorId, assignDto.teamId);
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

  @Get(':id/teams')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListJurors')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener equipos asignados a un jurado',
    description: 'Devuelve los equipos que tiene asignados el jurado especificado, incluyendo información básica del videojuego.',
  })
  @ApiOkResponse({
    description: 'Equipos asignados al jurado',
    schema: {
      example: {
        jurorId: '1f5c2a5b-29a5-4e9b-8c3c-222222222222',
        equipos: [
          { id: 12, nombre: 'Pixel Ninjas', videojuego: 'Galaxy Runner' },
          { id: 18, nombre: 'Code Warriors', videojuego: 'Brain Maze' },
        ],
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Jurado no encontrado' })
  @ApiUnauthorizedResponse({ description: 'Token faltante o inválido' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene permiso para consultar este jurado' })
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

  @Patch(':id/delete')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteJurror')
  softdelete(@Param('id') id: string) {
    return this.jurorService.remove(id);
  }
}
