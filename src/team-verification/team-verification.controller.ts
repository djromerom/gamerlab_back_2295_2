import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { TeamStatusQueryDto } from './dto/team-status-query.dto';
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

  // Debe ir antes de `:teamId`, o Express interpreta "status" como un id.
  @Get('status')
  @UseGuards(RolePermissionGuard)
  @RequiredService('Create Evaluation')
  @ApiOperation({
    summary: 'Estado de verificación de varios grupos para el jurado',
    description:
      'Devuelve { [teamId]: boolean }: true si el jurado ya verificó el grupo o si no exige código (N0). ' +
      'Un id que no existe en la edición activa sale como false. ' +
      'Con ?includeLocks=true devuelve { status, locks }, con locks[teamId] = { locked, lockedUntil (ISO 8601 o null) }.',
  })
  async getStatus(
    @Query() query: TeamStatusQueryDto,
    @GetUser('id') jurorId: string,
  ) {
    if (!query.includeLocks) {
      return this.service.getStatus(jurorId, query.teamIds);
    }
    const [status, locks] = await Promise.all([
      this.service.getStatus(jurorId, query.teamIds),
      this.service.getLocks(jurorId, query.teamIds),
    ]);
    return { status, locks };
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
