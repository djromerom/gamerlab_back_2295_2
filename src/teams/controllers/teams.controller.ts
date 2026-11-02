// src/teams/controllers/teams.controller.ts
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
  Query,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import { ApiBody, ApiExtraModels, getSchemaPath, ApiOperation, ApiOkResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { TeamsService } from '../services/teams.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateMemberEmailDto } from '../dto/update-member-email.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { RolePermissionGuard } from '../../auth/guards/role-permission.guard';
import { RequiredService } from '../../auth/decorators/required-service.decorator';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { OptionalAdminRoleGuard } from '../../auth/guards/admin-role.guard';
import { IsAdmin } from '../../auth/decorators/is-admin.decorator';
import { PUBLIC_LIMITS, PublicThrottle } from '../../common/throttle/public-throttle';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { AppUser } from '../../auth/jwt.strategy';
import { CheckTeamName } from '../dto/check-team-name.dto';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { ValidateStudentCodesDto } from '../dto/validate-student-codes.dto';
import { MemberDto } from '../dto/member.dto';
import { RegistrationsOpenGuard } from '../../settings/registrations-open.guard';

/**
 * Tope de `limit` en GET /teams. Más alto que el común (100) porque la vista «Todos» de la tabla de
 * administración pide `limit=999999` y debe recibir todos los equipos; evita `limit=100000000` (M9).
 */
export const MAX_TEAMS_LIST_LIMIT = 1000;

@Controller('teams')
@ApiTags('Teams')
@ApiExtraModels(UpdateTeamDto)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard, RegistrationsOpenGuard)
  @Post()
  create(@Body() createTeamDto: CreateTeamDto) {
    return this.teamsService.create(createTeamDto);
  }

  @Post('admin')
  @UseGuards(RolePermissionGuard)
  @RequiredService('RegisterTeam')
  createAsAdmin(
    @Body() CreateTeamDto: CreateTeamDto,
    @GetUser() user?: AppUser,
  ) {
    return this.teamsService.createAsAdmin(CreateTeamDto, user);
  }

  // Público para la galería; solo un administrador recibe correos y códigos (BG-02)
  @Public()
  @Get('')
  @UseGuards(OptionalJwtAuthGuard, OptionalAdminRoleGuard)
  getTeams(
    @IsAdmin() includePersonalData: boolean,
    @GetUser('id') currentUserId: string | undefined,
    @Query('page') @Optional() page?: string,
    @Query('limit') @Optional() limit?: string,
    @Query('sortByLikes') @Optional() sortByLikes?: boolean,
  ) {
    if (sortByLikes === undefined) {
      sortByLikes = false;
    }
    if (limit) {
      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = parseInt(limit, 10);
      if (!isNaN(pageNum) && !isNaN(limitNum) && pageNum > 0 && limitNum > 0) {
        return this.teamsService.findPaged(pageNum, Math.min(limitNum, MAX_TEAMS_LIST_LIMIT), sortByLikes, includePersonalData, currentUserId);
      }
    }
    return this.teamsService.findAll(sortByLikes, includePersonalData, currentUserId);
  }

  @Get('incomplete-jurors')
  @UseGuards(RolePermissionGuard)
  @RequiredService('AssignJurors')
  getTeamsWithIncompleteJurors() {
    return this.teamsService.getTeamsWithLessThanThreeJurors();
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
    return this.teamsService.findByVideogameName(videogameName.trim());
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('final-score/videogame/:videogameId')
  @ApiOperation({ summary: 'Get final scores for all teams for a videogame' })
  @ApiOkResponse({
    description: 'Array of team final scores for the videogame',
    schema: {
      example: [
        {
          teamId: 1,
          teamCode: 'N1-IST-101',
          isExternal: false,
          videogameId: 24,
          videogameName: 'Stella',
          editionId: 3,
          avgJunior: null,
          avgSenior: 5,
          finalScore: 2
        }
      ]
    }
  })
  getFinalScoreByVideogame(
    @Param('videogameId', ParseIntPipe) videogameId: number,
    @GetUser() user?: AppUser,
  ) {
    return this.teamsService.getFinalScoreByVideogame(videogameId, user);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('final-score/team/:teamId')
  @ApiOperation({ summary: 'Get final score(s) for a specific team' })
  @ApiOkResponse({
    description: 'Final score(s) for the team (one row per videogame)',
    schema: {
      example: [
        {
          teamId: 1,
          teamCode: 'N1-IST-101',
          isExternal: false,
          videogameId: 24,
          videogameName: 'Stella',
          editionId: 3,
          avgJunior: null,
          avgSenior: 5,
          finalScore: 2
        }
      ]
    }
  })
  getFinalScoreByTeam(
    @Param('teamId', ParseIntPipe) teamId: number,
    @GetUser() user?: AppUser,
  ) {
    return this.teamsService.getFinalScoreByTeam(teamId, user);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('final-score/by-n/:n')
  @ApiOperation({ summary: 'Get final scores for teams filtered by teamCode prefix (e.g., N1, N0, N2)' })
  @ApiParam({ name: 'n', required: true, description: "Team code prefix to filter by (N0..N4). Example: 'N1' or 'N1-'" })
  @ApiOkResponse({
    description: 'Array of TeamFinalScore rows whose teamCode starts with the given prefix',
    schema: {
      example: [
        {
          teamId: 1,
          teamCode: 'N1-IST-101',
          isExternal: false,
          videogameId: 24,
          videogameName: 'Stella',
          editionId: 3,
          avgJunior: null,
          avgSenior: 5,
          finalScore: 2,
          teamName: "Team1",
          logoUrl: "loguito"
        }
      ]
    }
  })
  getFinalScoresByN(@Param('n') n: string, @GetUser() user?: AppUser) {
    return this.teamsService.getFinalScoreByTeamCodePrefix(n, user);
  }

  @Public()
  @PublicThrottle(PUBLIC_LIMITS.validateEmails)
  @Post('validate-emails')
  validateEmails(@Body() validateEmailsDto: ValidateEmailsDto) {
    return this.teamsService.validateEmails(validateEmailsDto);
  }

  /** El paso 2 del registro revisa los códigos estudiantiles antes de avanzar. */
  @Public()
  @PublicThrottle(PUBLIC_LIMITS.validateStudentCodes)
  @Post('validate-student-codes')
  validateStudentCodes(@Body() dto: ValidateStudentCodesDto) {
    return this.teamsService.validateStudentCodes(dto);
  }

  @Get('leader/:email/status')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ViewTeamLeaderStatus')
  getStatus(@Param('email') email: string) {
    return this.teamsService.getLeaderStatus(email);
  }

  @Get(':id/full')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetTeam')
  findOneFull(@Param('id') id: string, @GetUser() user: AppUser) {
    return this.teamsService.findOneWithDetails(id, user);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetTeam')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: AppUser) {
    return this.teamsService.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateTeam')
  @ApiBody({
    schema: {
      $ref: getSchemaPath(UpdateTeamDto),
    },
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTeamDto,
    @GetUser() currentUser: AppUser,
  ) {
    if (!updateDto || Object.keys(updateDto).length === 0) {
      throw new BadRequestException(
        'El cuerpo de la solicitud no puede estar vacío',
      );
    }

    // Si contiene campos complejos (members, isExternal), usar update completo
    // Si solo tiene teamName o videogame, usar updateTeamInfo
    const complexFields = ['members', 'isExternal'];
    if (complexFields.some((field) => field in updateDto))
      return this.teamsService.update(id, updateDto, currentUser);

    return this.teamsService.updateTeamInfo(id, updateDto, currentUser);
  }

  @Patch(':teamId/members/:memberId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateTeam')
  updateMemberEmail(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() updateMemberEmailDto: UpdateMemberEmailDto,
    @GetUser('id') userId: string,
  ) {
    return this.teamsService.updateMemberEmail(
      teamId,
      memberId,
      updateMemberEmailDto,
      userId,
    );
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteTeam')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.remove(id);
  }

  @Post(':id/member')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateTeam')
  addMember(
    @Param('id', ParseIntPipe) id: number,
    @Body() memberDto: MemberDto,
    @GetUser() user: AppUser,
  ) {
    return this.teamsService.addMember(id, memberDto, user);
  }

  @Delete(':id/members/:memberId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateTeam')
  deleteMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @GetUser() user: AppUser,
  ) {
    return this.teamsService.deleteMember(id, memberId, user);
  }
}
