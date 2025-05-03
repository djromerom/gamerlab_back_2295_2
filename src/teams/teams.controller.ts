import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { CreateTeamWithMembersDto } from './dto/create-team-with-members.dto';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  create(@Body() createTeamDto: CreateTeamDto) {
    return this.teamsService.create(createTeamDto);
  }
  
  @Post('with-members')
async createWithMembers(@Body() dto: CreateTeamWithMembersDto) {
  const team = await this.teamsService.createTeamWithMembers(dto);
  
  // // Enviar emails de confirmación
  // for (const member of dto.members) {
  //   const token = generateToken(); // Implementar generación de token
  //   await this.mailService.sendConfirmationEmail(
  //     member.correo,
  //     dto.teamName,
  //     token
  //   );
  // }

  return team;
}
  @Get()
  findAll() {
    return this.teamsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTeamDto: UpdateTeamDto) {
    return this.teamsService.update(+id, updateTeamDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.teamsService.remove(+id);
  }
}