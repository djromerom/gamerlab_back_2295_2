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
} from '@nestjs/common';
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
  getTeamsWithIncompleteJurors() {
    return this.teamsService.getTeamsWithLessThanThreeJurors();
  }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListTeams')
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
  findOneFull(@Param('id', ParseIntPipe) id: number) {
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
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTeamDto | UpdateTeamInfoDto,
    @GetUser('id') userId: string,
  ) {
    // Si el body contiene campos de UpdateTeamInfoDto, usar updateTeamInfo
    const hasTeamInfoFields = 'teamName' in updateDto || 'description' in updateDto || 
                              'youtubeUrl' in updateDto || 'logoUrl' in updateDto || 
                              'githubUrl' in updateDto;
    
    if (hasTeamInfoFields) {
      return this.teamsService.updateTeamInfo(id, updateDto as UpdateTeamInfoDto, userId);
    }
    return this.teamsService.update(id, updateDto as UpdateTeamDto);
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
    return this.teamsService.updateMemberEmail(teamId, memberId, updateMemberEmailDto, userId);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteTeam')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.teamsService.remove(id);
  }
}
