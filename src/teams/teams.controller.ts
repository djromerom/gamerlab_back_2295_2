import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { CreateEmailRequestDto } from './dto/create-email-request.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Public()
  @Post()
  create(@Body() createTeamDto: CreateTeamDto) {
    return this.teamsService.create(createTeamDto);
  }

  @Get()
  findAll() {
    return this.teamsService.findAll();
  }

  @Post('send-email')
  async sendEmail(@Body() createEmailRequestDto: CreateEmailRequestDto) {
    return this.teamsService.sendEmail(
      createEmailRequestDto.email,
      createEmailRequestDto.id,
      createEmailRequestDto.name,
    );
  }

  @Post('register-user')
  async registerUser(@Body() registerUser: RegisterUserDto) {
    return this.teamsService.registerUser(registerUser);
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
