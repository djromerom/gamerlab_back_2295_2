import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { SetVerificationRequiredDto } from './dto/set-verification-required.dto';
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
    description:
      'Devuelve { teamId, teamCode, verificationCode, notGradable }. En un equipo no calificable (presentador externo, HU-39) `verificationCode` es null y `notGradable` es true: no se entrega código. En equipos de colegios (N0) `verificationCode` también es null.',
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
      'Devuelve { [teamId]: boolean }: true si el jurado ya verificó el grupo o si no exige código (N0, o código desactivado por el Administrador, HU-50). ' +
      'Un id que no existe en la edición activa sale como false. ' +
      'Con ?includeLocks=true devuelve { status, locks, required }, con locks[teamId] = { locked, lockedUntil (ISO 8601 o null) } ' +
      'y required[teamId] = si hoy se le pide el código al jurado (HU-50; false = mostrar el formulario directamente).',
  })
  async getStatus(
    @Query() query: TeamStatusQueryDto,
    @GetUser('id') jurorId: string,
  ) {
    if (!query.includeLocks) {
      return this.service.getStatus(jurorId, query.teamIds);
    }
    const [{ status, required }, locks] = await Promise.all([
      this.service.getStatusWithRequired(jurorId, query.teamIds),
      this.service.getLocks(jurorId, query.teamIds),
    ]);
    return { status, locks, required };
  }

  @Patch(':teamId/required')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageTeamVerificationCode')
  @ApiOperation({
    summary: 'Desactivar o activar el código de verificación de un equipo (administrador, HU-50)',
    description:
      'Body { required: false } desactiva el código: los jurados califican ese equipo sin digitarlo. ' +
      '{ required: true } lo vuelve a exigir, sin regenerarlo ni borrar las verificaciones hechas. ' +
      'Cada cambio queda registrado (CODE_DISABLED / CODE_ENABLED, quién y cuándo). Repetir el mismo valor no cambia nada (`changed: false`). ' +
      'El interruptor global (PATCH /settings/verification-codes) manda sobre este: si está apagado, ningún equipo pide código. ' +
      '`verificationRequired` también sale en la lista de equipos (GET /teams).',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { teamId: 41, verificationRequired: false, changed: true } },
  })
  @ApiResponse({
    status: 400,
    description:
      'Body inválido, o equipo de colegios (N0) o no calificable (`TEAM_NOT_GRADABLE`): no tienen código.',
  })
  @ApiResponse({ status: 403, description: 'Sin permiso, o el equipo es de una edición cerrada.' })
  @ApiResponse({ status: 404, description: 'Equipo no encontrado.' })
  setRequired(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: SetVerificationRequiredDto,
    @GetUser('id') adminId: string,
  ) {
    return this.service.setRequired(teamId, dto.required, adminId);
  }

  @Get(':teamId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageTeamVerificationCode')
  @ApiOperation({
    summary: 'Consultar el código de un equipo (administrador)',
    description:
      '400 en equipos de colegios (N0) y en equipos no calificables (`TEAM_NOT_GRADABLE`): no tienen código.',
  })
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
      'Se usa cuando el estudiante perdió el código. Queda registrado quién lo regeneró. 400 en equipos de colegios (N0) y en equipos no calificables (`TEAM_NOT_GRADABLE`).',
  })
  regenerate(
    @Param('teamId', ParseIntPipe) teamId: number,
    @GetUser('id') adminId: string,
  ) {
    return this.service.regenerate(teamId, adminId);
  }
}
