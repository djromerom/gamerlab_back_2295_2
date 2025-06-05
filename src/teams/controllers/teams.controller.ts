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
} from '@nestjs/common';
import { TeamsService } from '../services/teams.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { CheckTeamName } from '../dto/check-team-name.dto';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';


@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) { }

  @Public()
  @HttpCode(400)
  @Post()
  create(@Body() createTeamDto: CreateTeamDto) {
    return 'Registrations are closed';
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

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetTeam')
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateTeam')
  update(@Param('id') id: string, @Body() updateTeamDto: UpdateTeamDto) {
    return this.teamsService.update(+id, updateTeamDto);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteTeam')
  remove(@Param('id') id: string) {
    return this.teamsService.remove(+id);
  }
}
