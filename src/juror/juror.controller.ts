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
  ApiCreatedResponse,
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new juror',
    description: 'Creates a new juror account with the provided information.',
  })
  @ApiBody({
    type: CreateJurorDto,
    description: 'Juror creation data',
  })
  @ApiCreatedResponse({
    description: 'Juror created successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid juror data' })
  @ApiConflictResponse({ description: 'Email already exists' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'User does not have permission to create jurors' })
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
    summary: 'List active jurors with their assigned teams',
    description:
      'Returns active and confirmed jurors along with the teams and videogames they have assigned, plus the total number of assignments.',
  })
  @ApiOkResponse({
    description: 'List of jurors with their assigned teams',
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
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'User does not have permission to list jurors' })
  getEvaluatorsWithTeams() {
    return this.jurorService.getEvaluatorsWithTeams();
  }

  @Post('assignments')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Manually assign a juror to a team',
    description: 'Allows assigning an active juror to a team that has less than three registered jurors.',
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
    description: 'Juror assigned successfully to the team',
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
  @ApiBadRequestResponse({ description: 'Invalid data or user is not a juror / team already has three jurors' })
  @ApiConflictResponse({ description: 'Juror is already assigned to that team' })
  @ApiNotFoundResponse({ description: 'Juror or team not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'User does not have permission to assign jurors' })
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
    summary: 'Get teams assigned to a juror',
    description: 'Returns the teams assigned to the specified juror, including basic videogame information.',
  })
  @ApiOkResponse({
    description: 'Teams assigned to the juror',
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
  @ApiNotFoundResponse({ description: 'Juror not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'User does not have permission to query this juror' })
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a juror',
    description: 'Updates juror information.',
  })
  @ApiBody({
    type: UpdateJurorDto,
    description: 'Juror update data',
  })
  @ApiOkResponse({
    description: 'Juror updated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid update data' })
  @ApiNotFoundResponse({ description: 'Juror not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'User does not have permission to update jurors' })
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
