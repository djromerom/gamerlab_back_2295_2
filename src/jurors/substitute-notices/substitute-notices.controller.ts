import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { ListMyNoticesQueryDto } from './dto/list-my-notices-query.dto';
import { SubstituteNoticesService } from './substitute-notices.service';

const edition = { id: 5, title: 'ARKAD 2026-30' };
const noticeExample = {
  id: 12,
  createdAt: '2026-11-26T16:05:00.000Z',
  readAt: null,
  message: 'Te asignaron grupos',
  teams: [
    {
      teamId: 41,
      teamCode: 'N1-AYP-06',
      teamName: 'Pixel Rebels',
      videogameName: 'Cosmic Run',
      level: 1,
      levelLabel: 'Nivel 1',
    },
  ],
};
const noActiveEdition = 'No hay edición activa (`code: NO_ACTIVE_EDITION`)';

@ApiTags('Substitute notices')
@Controller('substitute-notices')
@UseGuards(RolePermissionGuard)
export class SubstituteNoticesController {
  constructor(private readonly noticesService: SubstituteNoticesService) {}

  @Get('me')
  @RequiredService('ViewOwnSubstituteNotices')
  @ApiOperation({
    summary: 'Avisos "Te asignaron grupos" del suplente (HU-22)',
    description:
      'Avisos del usuario en la edición activa: cada uno lista los grupos asignados y su nivel. Por defecto solo los sin leer (`status=unread`); con `status=all` también los leídos, primero los sin leer. El front consulta cada 10 s.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        edition,
        serverTime: '2026-11-26T16:05:10.000Z',
        unreadCount: 1,
        data: [noticeExample],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Filtro no válido' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: noActiveEdition })
  getMine(@GetUser('id') userId: string, @Query() query: ListMyNoticesQueryDto) {
    return this.noticesService.findMine(userId, query.status ?? 'unread');
  }

  @Patch(':id/read')
  @RequiredService('ViewOwnSubstituteNotices')
  @ApiOperation({
    summary: 'El suplente marca un aviso como leído (HU-22)',
    description:
      'Solo el dueño del aviso. Repetirlo no cambia la hora de lectura. Devuelve el aviso.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: { ...noticeExample, readAt: '2026-11-26T16:06:00.000Z' },
    },
  })
  @ApiResponse({ status: 400, description: 'El id no es un número' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description:
      'El aviso no existe o no es del usuario (`code: SUBSTITUTE_NOTICE_NOT_FOUND`)',
  })
  markRead(
    @GetUser('id') userId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.noticesService.markRead(userId, id);
  }

  @Get('unread')
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Avisos a suplentes sin leer en la edición activa (HU-22)',
    description:
      'Para el panel de seguimiento: qué suplentes no han leído el aviso de grupos asignados, el más antiguo primero. `emailStatus`: PENDING, SENT, FAILED o SKIPPED (sin claves de correo en desarrollo).',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        edition,
        serverTime: '2026-11-26T16:10:00.000Z',
        totals: { unread: 1, jurors: 1 },
        data: [
          {
            noticeId: 12,
            jurorId: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01',
            name: 'Ana Pérez',
            createdAt: '2026-11-26T16:05:00.000Z',
            teamCount: 2,
            emailStatus: 'SENT',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({ status: 404, description: noActiveEdition })
  listUnread() {
    return this.noticesService.listUnread();
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiredService('AssignJurors')
  @ApiOperation({
    summary: 'Reenviar el correo de un aviso que no salió (BG-74)',
    description:
      'Solo Administrador. Solo para avisos con `emailStatus: FAILED` («El correo no salió»). El aviso pasa a PENDING y el correo sale por la cola de envío (con pausa entre correos), así que la respuesta no espera a ACS: el resultado (SENT o FAILED) se ve en `GET /substitute-notices/unread`.',
  })
  @ApiResponse({
    status: 202,
    schema: { example: { noticeId: 12, emailStatus: 'PENDING' } },
  })
  @ApiResponse({ status: 400, description: 'El id no es un número' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description: 'El aviso no existe (`code: SUBSTITUTE_NOTICE_NOT_FOUND`)',
  })
  @ApiResponse({
    status: 409,
    description:
      'El correo del aviso no está en FAILED: ya salió, se está enviando o se omitió (`code: SUBSTITUTE_NOTICE_EMAIL_NOT_FAILED`, con `emailStatus` actual)',
  })
  resendEmail(@Param('id', ParseIntPipe) id: number) {
    return this.noticesService.resendEmail(id);
  }
}
