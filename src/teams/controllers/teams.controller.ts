import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { TeamsService } from '../services/teams.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateTeamInfoDto } from '../dto/update-team-info.dto';
import { UpdateMemberEmailDto } from '../dto/update-member-email.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { CheckTeamName } from '../dto/check-team-name.dto';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AppUser } from 'src/auth/jwt.strategy';

@ApiTags('Teams')
@ApiExtraModels(UpdateTeamDto, UpdateTeamInfoDto)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) { }

  @Public()
  @Post()
  @ApiOperation({
    summary: 'Create a new team',
    description: 'Creates a new team with the provided information.',
  })
  @ApiBody({
    type: CreateTeamDto,
    description: 'Team creation data',
  })
  @ApiCreatedResponse({
    description: 'Team created successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid team data' })
  @ApiConflictResponse({ description: 'Team name or videogame name already exists' })
  create(@Body() createTeamDto: CreateTeamDto) {
    return this.teamsService.create(createTeamDto);
  }

  @Get('incomplete-jurors')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListTeams')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List confirmed teams with less than three jurors',
    description:
      'Returns active and confirmed teams that do not yet have three jurors assigned, including leader data and current jurors.',
  })
  @ApiOkResponse({
    description: 'Teams retrieved successfully',
    schema: {
      example: [
        {
          id: 12,
          nombre: 'Pixel Ninjas',
          videojuego: 'Galaxy Runner',
          lider: {
            id: '0f5c2a5b-29a5-4e9b-8c3c-111111111111',
            nombre: 'Ana García',
            email: 'ana.garcia@example.com',
          },
          juradosAsignados: [
            {
              id: '1f5c2a5b-29a5-4e9b-8c3c-222222222222',
              nombre: 'Carlos Pérez',
              email: 'carlos.perez@example.com',
            },
          ],
          cantidadJurados: 1,
        },
      ],
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'User does not have permission to query teams' })
  getTeamsWithIncompleteJurors() {
    return this.teamsService.getTeamsWithLessThanThreeJurors();
  }

  @Public()
  @Get()
  findAll() {
    return this.teamsService.findAll();
  }

  @Public()
  @Get('name/:teamName')
  findByTeamName(@Param() checkTeamNameDto: CheckTeamName) {
    const { teamName } = checkTeamNameDto;
    return this.teamsService.findByTeamName(teamName);
  }

  @Public()
  @Get('videogame/:videogameName')
  findByVideogameName(@Param('videogameName') videogameName: string) {
    return this.teamsService.findByVideogameName(videogameName);
  }

  @Public()
  @Post('validate-emails')
  @ApiOperation({
    summary: 'Validate email addresses',
    description: 'Validates if the provided email addresses are valid and available.',
  })
  @ApiBody({
    type: ValidateEmailsDto,
    description: 'Email addresses to validate',
  })
  @ApiOkResponse({
    description: 'Email validation result',
  })
  @ApiBadRequestResponse({ description: 'Invalid email format' })
  validateEmails(@Body() validateEmailsDto: ValidateEmailsDto) {
    return this.teamsService.validateEmails(validateEmailsDto);
  }

  @Get(':id/full')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetTeam')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get complete information of a team',
    description:
      'Includes leader data, videogame (with URLs and resources), members, jurors and associated edition.',
  })
  @ApiOkResponse({
    description: 'Team information retrieved',
    schema: {
      example: {
        id: 12,
        teamName: 'Pixel Ninjas',
        user: {
          id: '0f5c2a5b-29a5-4e9b-8c3c-111111111111',
          email: 'ana.garcia@example.com',
          firstName: 'Ana',
          lastName: 'García',
        },
        videogame: {
          id: 7,
          name: 'Galaxy Runner',
          description: 'Juego de plataformas ambientado en el espacio.',
          logoUrl: 'https://cdn.example.com/logos/galaxy-runner.png',
          videoUrl: 'https://www.youtube.com/watch?v=Wxyz123',
          repoUrl: 'https://github.com/example/galaxy-runner',
          additionalImages: [
            'https://cdn.example.com/screenshots/galaxy-runner-1.png',
            'https://cdn.example.com/screenshots/galaxy-runner-2.png',
          ],
        },
        members: [
          {
            id: 31,
            firstName: 'Luis',
            lastName: 'Martínez',
            email: 'luis.martinez@example.com',
            studentCode: '202511002',
          },
        ],
        assignedJurors: [
          {
            id: '1f5c2a5b-29a5-4e9b-8c3c-222222222222',
            firstName: 'Carlos',
            lastName: 'Pérez',
            email: 'carlos.perez@example.com',
          },
        ],
        edition: {
          id: 2,
          semester: '2025-10',
          title: 'Feria Gamer 2025 - S1',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Team not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'User does not have permission to view the team' })
  findOneFull(@Param('id') id: string) {
    return this.teamsService.findOneWithDetails(id);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetTeam')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a team by ID',
    description: 'Returns the basic information of the team identified by its numeric ID.',
  })
  @ApiOkResponse({ description: 'Team found' })
  @ApiNotFoundResponse({ description: 'Team not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'User does not have permission to view the team' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateTeam')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update team information',
    description:
      'Allows the team leader to update videogame data (including the list of additional images) or the team data itself.',
  })
  @ApiBody({
    description: 'Update team data. Can be either UpdateTeamDto or UpdateTeamInfoDto',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(UpdateTeamDto) },
        { $ref: getSchemaPath(UpdateTeamInfoDto) },
      ],
    },
  })
  @ApiOkResponse({
    description: 'Team updated successfully',
    schema: {
      example: {
        id: 12,
        teamName: 'Pixel Ninjas Reloaded',
        videogame: {
          id: 7,
          name: 'Galaxy Runner DX',
          description: 'Versión mejorada con nuevos niveles.',
          videoUrl: 'https://www.youtube.com/watch?v=ZXCV678',
          repoUrl: 'https://github.com/example/galaxy-runner-dx',
          logoUrl: 'https://cdn.example.com/logos/galaxy-runner-dx.png',
          additionalImages: [
            'https://cdn.example.com/screenshots/galaxy-runner-dx-1.png',
            'https://cdn.example.com/screenshots/galaxy-runner-dx-2.png',
          ],
        },
        members: [],
        assignedJurors: [],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Request body is invalid or empty' })
  @ApiConflictResponse({ description: 'Conflict with existing data (name or URLs)' })
  @ApiNotFoundResponse({ description: 'Team or videogame not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'Only the team leader can update the information' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTeamDto | UpdateTeamInfoDto,
    @GetUser() currentUser: AppUser,
  ) {
    if (!updateDto || Object.keys(updateDto).length === 0) {
      throw new BadRequestException('El cuerpo de la solicitud no puede estar vacío');
    }

    // Si el body contiene campos de UpdateTeamInfoDto, usar updateTeamInfo
    const hasTeamInfoFields =
      Object.prototype.hasOwnProperty.call(updateDto, 'teamName') ||
      Object.prototype.hasOwnProperty.call(updateDto, 'videogameName') ||
      Object.prototype.hasOwnProperty.call(updateDto, 'description') ||
      Object.prototype.hasOwnProperty.call(updateDto, 'videoUrl') ||
      Object.prototype.hasOwnProperty.call(updateDto, 'logoUrl') ||
      Object.prototype.hasOwnProperty.call(updateDto, 'repoUrl') ||
      Object.prototype.hasOwnProperty.call(updateDto, 'additionalImages');

    if (hasTeamInfoFields) {
      return this.teamsService.updateTeamInfo(id, updateDto as UpdateTeamInfoDto, currentUser);
    }
    return this.teamsService.update(id, updateDto as UpdateTeamDto);
  }

  @Patch(':teamId/members/:memberId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateTeam')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a member email',
    description:
      'Allows the team leader to update the email of a specific member who is not the leader.',
  })
  @ApiOkResponse({
    description: 'Member email updated successfully',
    schema: {
      example: {
        id: 45,
        firstName: 'Luis',
        lastName: 'Martínez',
        email: 'nuevo.correo@example.com',
        studentCode: '202511002',
        teamId: 12,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request (e.g., member does not belong to the team or leader email)' })
  @ApiConflictResponse({ description: 'Email is already in use' })
  @ApiNotFoundResponse({ description: 'Team or member not found' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'Only the team leader can modify members' })
  @ApiBody({
    type: UpdateMemberEmailDto,
    description: 'New email address for the member',
    schema: {
      example: {
        email: 'new.email@uninorte.edu.co',
      },
    },
  })
  updateMemberEmail(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() updateMemberEmailDto: UpdateMemberEmailDto,
    @GetUser('id') userId: string,
  ) {
    return this.teamsService.updateMemberEmail(teamId, memberId, updateMemberEmailDto, userId);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteTeam')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.remove(id);
  }
}
