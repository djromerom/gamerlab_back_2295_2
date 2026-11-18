import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RolePermissionGuard } from '../../auth/guards/role-permission.guard';
import { RequiredService } from '../../auth/decorators/required-service.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { SetTeamGradableDto } from '../dto/set-team-gradable.dto';
import { TeamGradableService } from '../services/team-gradable.service';

/**
 * HU-39 (ARK-209): marca de equipo no calificable (presentador externo que es un equipo).
 * Va en su propio controlador para no cambiar las dependencias de `TeamsController`.
 */
@ApiTags('Teams')
@Controller('teams')
export class TeamGradableController {
  constructor(private readonly teamGradable: TeamGradableService) {}

  @Patch(':id/gradable')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageExternalPresenters')
  @ApiOperation({
    summary:
      'Marcar o desmarcar un equipo como no calificable (solo Administrador)',
    description:
      'HU-39 (ARK-209): un equipo no calificable es un presentador externo. Sigue en la galería, pero no recibe jurados, no se califica y no entra al ranking ni a las notas. Al marcarlo se le retiran los jurados (bitácora y aviso push) y la respuesta los lista en `juradosRetirados`; sus evaluaciones no se borran y vuelven a contar si se quita la marca. Solo equipos de la edición activa (400 `TEAM_NOT_IN_ACTIVE_EDITION`). ARK-257: marcar exige el videojuego Confirmado (400 `TEAM_NOT_CONFIRMED`); desmarcar siempre se permite.',
  })
  @ApiParam({ name: 'id', type: Number })
  setGradable(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetTeamGradableDto,
    @GetUser('id') adminId: string,
  ) {
    return this.teamGradable.setNotGradable(id, dto.notGradable, adminId);
  }
}
