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
  create(@Body() createTeamDto: CreateTeamDto) {
    return this.teamsService.create(createTeamDto);
  }

  @Get('incomplete-jurors')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListTeams')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar equipos confirmados con menos de tres jurados',
    description:
      'Devuelve los equipos activos y confirmados que aún no tienen tres jurados asignados, incluyendo datos del líder y jurados actuales.',
  })
  @ApiOkResponse({
    description: 'Equipos obtenidos correctamente',
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
  @ApiUnauthorizedResponse({ description: 'Token faltante o inválido' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene permiso para consultar equipos' })
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
  validateEmails(@Body() validateEmailsDto: ValidateEmailsDto) {
    return this.teamsService.validateEmails(validateEmailsDto);
  }

  @Get(':id/full')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetTeam')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener información completa de un equipo',
    description:
      'Incluye datos del líder, videojuego (con URLs y recursos), integrantes, jurados y edición asociada.',
  })
  @ApiOkResponse({
    description: 'Información del equipo obtenida',
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
  @ApiNotFoundResponse({ description: 'Equipo no encontrado' })
  @ApiUnauthorizedResponse({ description: 'Token faltante o inválido' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene permiso para ver el equipo' })
  findOneFull(@Param('id') id: string) {
    return this.teamsService.findOneWithDetails(id);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetTeam')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener un equipo por ID',
    description: 'Devuelve la información básica del equipo identificado por su ID numérico.',
  })
  @ApiOkResponse({ description: 'Equipo encontrado' })
  @ApiNotFoundResponse({ description: 'Equipo no encontrado' })
  @ApiUnauthorizedResponse({ description: 'Token faltante o inválido' })
  @ApiForbiddenResponse({ description: 'El usuario no tiene permiso para ver el equipo' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateTeam')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Actualizar información de equipo',
    description:
      'Permite al líder del equipo actualizar datos del videojuego (incluyendo la lista de imágenes adicionales) o los datos del propio equipo.',
  })
  @ApiOkResponse({
    description: 'Equipo actualizado correctamente',
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
  @ApiBadRequestResponse({ description: 'El cuerpo de la solicitud es inválido o está vacío' })
  @ApiConflictResponse({ description: 'Conflicto con datos existentes (nombre o URLs)' })
  @ApiNotFoundResponse({ description: 'Equipo o videojuego no encontrado' })
  @ApiUnauthorizedResponse({ description: 'Token faltante o inválido' })
  @ApiForbiddenResponse({ description: 'Solo el líder del equipo puede actualizar la información' })
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
    summary: 'Actualizar el email de un integrante',
    description:
      'Permite al líder del equipo actualizar el correo de un integrante específico que no sea el líder.',
  })
  @ApiOkResponse({
    description: 'Email del integrante actualizado correctamente',
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
  @ApiBadRequestResponse({ description: 'Solicitud inválida (por ejemplo, integrante no pertenece al equipo o email del líder)' })
  @ApiConflictResponse({ description: 'El email ya está en uso' })
  @ApiNotFoundResponse({ description: 'Equipo o integrante no encontrado' })
  @ApiUnauthorizedResponse({ description: 'Token faltante o inválido' })
  @ApiForbiddenResponse({ description: 'Solo el líder del equipo puede modificar integrantes' })
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
