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
  HttpCode,
  ParseIntPipe,
  Query,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import { ApiBody, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { TeamsService } from '../services/teams.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateMemberEmailDto } from '../dto/update-member-email.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { RolePermissionGuard } from '../../auth/guards/role-permission.guard';
import { RequiredService } from '../../auth/decorators/required-service.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { AppUser } from '../../auth/jwt.strategy';
import { CheckTeamName } from '../dto/check-team-name.dto';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';

@Controller('teams')
@ApiExtraModels(UpdateTeamDto)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Public()
  @Post()
  create(@Body() createTeamDto: CreateTeamDto) {
    return this.teamsService.create(createTeamDto);
  }

  @Post('admin')
  createAsAdmin(
    @Body() CreateTeamDto: CreateTeamDto,
    @GetUser() user?: AppUser,
  ) {
    return this.teamsService.createAsAdmin(CreateTeamDto, user);
  }

  @Public()
  @Get('')
  @RequiredService('ListTeams')
  getTeams(
    @Query('page') @Optional() page?: string,
    @Query('limit') @Optional() limit?: string,
    @Query('sortByLikes') @Optional() sortByLikes?: boolean,
  ) {
    if (sortByLikes === undefined) {
      sortByLikes = false;
    }
    if (page && limit) {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      if (!isNaN(pageNum) && !isNaN(limitNum) && pageNum > 0 && limitNum > 0) {
        return this.teamsService.findPaged(pageNum, limitNum, sortByLikes);
      }
    }
    return this.teamsService.findAll(sortByLikes);
  }

  @Get('incomplete-jurors')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListTeams')
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
    return this.teamsService.findByVideogameName(videogameName);
  }

  @Public()
  @Post('validate-emails')
  validateEmails(@Body() validateEmailsDto: ValidateEmailsDto) {
    return this.teamsService.validateEmails(validateEmailsDto);
  }

  @Get('leader/:email/status')
  getStatus(@Param('email') email: string) {
    return this.teamsService.getLeaderStatus(email);
  }

  @Get(':id/full')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetTeam')
  findOneFull(@Param('id') id: string) {
    return this.teamsService.findOneWithDetails(id);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetTeam')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.findOne(id);
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
      return this.teamsService.update(
        id,
        updateDto,
        currentUser,
      );

    return this.teamsService.updateTeamInfo(
      id,
      updateDto,
      currentUser,
    );
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
}
