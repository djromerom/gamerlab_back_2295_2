import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { ListPresenceQueryDto } from './dto/list-presence-query.dto';
import { UpdatePresenceSettingsDto } from './dto/update-presence-settings.dto';
import { JurorPresenceService } from './juror-presence.service';

const edition = { id: 5, title: 'ARKAD 2026-30' };
const settings = {
  promptEveryMinutes: 60,
  responseWindowMinutes: 15,
  inactivityMinutes: 45,
};
const mineExample = {
  edition,
  serverTime: '2026-11-26T14:20:00.000Z',
  evaluationsOpen: true,
  settings,
  checkedIn: true,
  checkedInAt: '2026-11-26T13:05:12.000Z',
  lastConfirmedAt: null,
  nextPromptAt: '2026-11-26T14:05:12.000Z',
  promptDue: true,
};
const noActiveEdition = 'No hay edición activa (`code: NO_ACTIVE_EDITION`)';

@ApiTags('Juror presence')
@Controller('juror-presence')
@UseGuards(RolePermissionGuard)
export class JurorPresenceController {
  constructor(private readonly presenceService: JurorPresenceService) {}

  @Get('me')
  @RequiredService('ConfirmJurorPresence')
  @ApiOperation({
    summary: 'Cuándo debe el jurado confirmar que sigue en la feria (HU-23)',
    description:
      'Con `promptDue: true` la pantalla muestra "¿Sigues en la feria?". Sin llegada registrada (`checkedIn: false`) o con las evaluaciones cerradas nunca se pregunta. Las horas son del servidor (UTC): usar `serverTime` para calcular la cuenta regresiva.',
  })
  @ApiResponse({ status: 200, schema: { example: mineExample } })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: noActiveEdition })
  getMine(@GetUser('id') userId: string) {
    return this.presenceService.getMine(userId);
  }

  @Post('me/confirm')
  @RequiredService('ConfirmJurorPresence')
  @ApiOperation({
    summary: 'El jurado responde "Sigo aquí" (HU-23)',
    description:
      'Guarda la hora del servidor y devuelve el mismo cuerpo que `GET /juror-presence/me`, con la próxima pregunta. Repetirlo no hace daño.',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        ...mineExample,
        lastConfirmedAt: mineExample.serverTime,
        nextPromptAt: '2026-11-26T15:20:00.000Z',
        promptDue: false,
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: noActiveEdition })
  @ApiResponse({
    status: 409,
    description:
      'El jurado no tiene su llegada registrada (`code: JUROR_NOT_CHECKED_IN`)',
  })
  confirmMine(@GetUser('id') userId: string) {
    return this.presenceService.confirmMine(userId);
  }

  @Get()
  @RequiredService('ManageJurorPresence')
  @ApiOperation({
    summary: 'Indicadores de presencia de los jurados que llegaron (HU-23)',
    description:
      'Jurados de la edición activa con llegada registrada que todavía tienen equipos asignados sin calificar (BG-72): el que ya calificó todos no sale, y vuelve a salir si le asignan uno nuevo. `pendingTeams` dice cuántos le faltan. `totals.checkedIn` cuenta a todos los que llegaron, `withPendingTeams` a los listados y `finished` a los que ya terminaron; los demás totales son de los listados. `indicators` puede traer PRESENCE_UNCONFIRMED (no respondió "Sigo aquí" a tiempo) y POSSIBLE_LEFT (sin enviar evaluaciones en el tiempo configurado). Son solo indicadores: no cambian asignaciones. Vacíos mientras las evaluaciones estén cerradas. Primero los que tienen indicadores.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        edition,
        serverTime: '2026-11-26T15:30:00.000Z',
        evaluationsOpen: true,
        settings,
        totals: {
          checkedIn: 42,
          withPendingTeams: 30,
          finished: 12,
          presenceUnconfirmed: 3,
          possibleLeft: 2,
          withAnyIndicator: 4,
        },
        data: [
          {
            jurorId: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01',
            name: 'Ana Pérez',
            category: 'Senior',
            isProfessor: true,
            checkedInAt: '2026-11-26T13:05:12.000Z',
            lastConfirmedAt: '2026-11-26T14:06:00.000Z',
            lastActivityAt: '2026-11-26T14:20:41.000Z',
            nextPromptAt: '2026-11-26T15:06:00.000Z',
            pendingTeams: 2,
            indicators: ['PRESENCE_UNCONFIRMED', 'POSSIBLE_LEFT'],
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Filtro no válido' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: noActiveEdition })
  list(@Query() query: ListPresenceQueryDto) {
    return this.presenceService.list(query);
  }

  @Get('settings')
  @RequiredService('ManageJurorPresence')
  @ApiOperation({
    summary: 'Parámetros de presencia de la edición activa (HU-23)',
  })
  @ApiResponse({ status: 200, schema: { example: { edition, settings } } })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: noActiveEdition })
  getSettings() {
    return this.presenceService.getSettings();
  }

  @Patch('settings')
  @RequiredService('ManageJurorPresence')
  @ApiOperation({
    summary: 'Cambia los parámetros de presencia de la edición activa (HU-23)',
    description:
      'En minutos. Se envían solo los que cambian; los demás se conservan. Por defecto 60, 15 y 45.',
  })
  @ApiResponse({ status: 200, schema: { example: { edition, settings } } })
  @ApiResponse({ status: 400, description: 'Valores fuera de rango' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: noActiveEdition })
  updateSettings(@Body() dto: UpdatePresenceSettingsDto) {
    return this.presenceService.updateSettings(dto);
  }
}
