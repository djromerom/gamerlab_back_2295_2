import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { VerifyTeamDto } from './dto/verify-team.dto';
import { TeamVerificationService } from './team-verification.service';

@ApiTags('Team verification')
@Controller('team-verification')
export class TeamVerificationController {
  constructor(private readonly service: TeamVerificationService) {}

  @Post('verify')
  @UseGuards(RolePermissionGuard)
  @RequiredService('Create Evaluation')
  @ApiOperation({
    summary: 'Verificar el código del grupo antes de calificarlo',
    description:
      'El jurado digita el código que el estudiante ve en su panel. Se pide una vez por grupo. ' +
      'Los equipos de colegios (N0) no requieren código.',
  })
  @ApiResponse({ status: 201, description: '{ verified: true, required }' })
  @ApiResponse({ status: 400, description: 'El código no coincide.' })
  @ApiResponse({ status: 403, description: 'El grupo no está asignado.' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos fallidos.' })
  verify(@Body() dto: VerifyTeamDto, @GetUser('id') jurorId: string) {
    return this.service.verify(jurorId, dto);
  }

  @Get('my-code')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MyTeamMembers')
  @ApiOperation({
    summary: 'Código de verificación del equipo del estudiante (panel)',
  })
  getMyCode(@GetUser('id') userId: string) {
    return this.service.getCodeForStudent(userId);
  }

  @Get(':teamId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageTeamVerificationCode')
  @ApiOperation({ summary: 'Consultar el código de un equipo (administrador)' })
  getCode(
    @Param('teamId', ParseIntPipe) teamId: number,
    @GetUser('id') adminId: string,
  ) {
    return this.service.getCodeForAdmin(teamId, adminId);
  }

  @Post(':teamId/regenerate')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageTeamVerificationCode')
  @ApiOperation({
    summary: 'Regenerar el código de un equipo (administrador)',
    description:
      'Se usa cuando el estudiante perdió el código. Queda registrado quién lo regeneró.',
  })
  regenerate(
    @Param('teamId', ParseIntPipe) teamId: number,
    @GetUser('id') adminId: string,
  ) {
    return this.service.regenerate(teamId, adminId);
  }
}
