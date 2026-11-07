import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { UnsubscribePushDto } from './dto/unsubscribe-push.dto';
import { PushNoticesService } from './push-notices.service';
import { PushSubscriptionsService } from './push-subscriptions.service';

const OWN_SUBSCRIPTION_SERVICE = 'ManageOwnPushSubscription';

/** Lo que comparten las dos rutas de avisos del administrador. */
const ApiNoticeResponses = () =>
  applyDecorators(
    ApiResponse({
      status: 200,
      schema: {
        example: {
          edition: { id: 5, title: 'ARKAD 2026-30' },
          totals: { jurors: 2, devices: 2, sent: 1, expired: 1, failed: 0 },
          results: [
            {
              jurorId: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01',
              devices: 2,
              sent: 1,
              expired: 1,
              failed: 0,
            },
            {
              jurorId: '7a1c2b3d-4e5f-4a6b-8c9d-0e1f2a3b4c02',
              devices: 0,
              sent: 0,
              expired: 0,
              failed: 0,
            },
          ],
        },
      },
    }),
    ApiResponse({ status: 403, description: 'Sin permiso' }),
    ApiResponse({
      status: 404,
      description: 'No hay una edición activa (`code: NO_ACTIVE_EDITION`)',
    }),
    ApiResponse({
      status: 503,
      description: 'Faltan las claves VAPID (`code: PUSH_DISABLED`)',
    }),
  );

@ApiTags('Push notifications')
@Controller('push')
@UseGuards(RolePermissionGuard)
export class PushNotificationsController {
  constructor(
    private readonly subscriptions: PushSubscriptionsService,
    private readonly notices: PushNoticesService,
  ) {}

  @Get('public-key')
  @RequiredService(OWN_SUBSCRIPTION_SERVICE)
  @ApiOperation({
    summary: 'Clave pública VAPID para suscribir el navegador (HU-37)',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: { enabled: true, publicKey: 'BEl62iUYgUivxIkv69yV...' },
    },
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  getPublicKey() {
    return this.subscriptions.getPublicKey();
  }

  @Get('status')
  @RequiredService(OWN_SUBSCRIPTION_SERVICE)
  @ApiOperation({
    summary: 'Si el envío está activo y cuántos dispositivos tiene el usuario',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { enabled: true, devices: 1 } },
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  getStatus(@GetUser('id') userId: string) {
    return this.subscriptions.getStatus(userId);
  }

  @Post('subscribe')
  @RequiredService(OWN_SUBSCRIPTION_SERVICE)
  @ApiOperation({
    summary: 'Registra este dispositivo para el usuario de la sesión',
    description:
      'Idempotente. El cuerpo es `subscription.toJSON()`. Si el dispositivo estaba registrado a otro usuario, pasa al de la sesión.',
  })
  @ApiResponse({
    status: 201,
    schema: { example: { subscribed: true, devices: 1 } },
  })
  @ApiResponse({
    status: 400,
    description:
      'Datos no válidos o servicio de push no admitido (`code: PUSH_ENDPOINT_NOT_ALLOWED`)',
  })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  subscribe(@GetUser('id') userId: string, @Body() dto: SubscribePushDto) {
    return this.subscriptions.subscribe(userId, dto);
  }

  @Post('unsubscribe')
  @HttpCode(200)
  @RequiredService(OWN_SUBSCRIPTION_SERVICE)
  @ApiOperation({
    summary: 'Desactiva este dispositivo del usuario de la sesión',
    description:
      'Idempotente. Una dirección ajena o desconocida no cambia nada y responde igual.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { subscribed: false, devices: 0 } },
  })
  @ApiResponse({ status: 400, description: 'Datos no válidos' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  unsubscribe(@GetUser('id') userId: string, @Body() dto: UnsubscribePushDto) {
    return this.subscriptions.unsubscribe(userId, dto.endpoint);
  }

  @Post('notices/arrival-reminder')
  @HttpCode(200)
  @RequiredService('SendPushNotice')
  @ApiOperation({
    summary: 'Recordatorio de llegada a los jurados que aún no han llegado',
    description:
      'Solo a los jurados de la edición activa sin llegada activa en la asistencia. El texto es fijo. Responde por jurado: `devices: 0` significa que no ha activado las notificaciones.',
  })
  @ApiNoticeResponses()
  sendArrivalReminder(@GetUser('id') adminId: string) {
    return this.notices.sendArrivalReminder(adminId);
  }

  @Post('notices/pending-evaluations')
  @HttpCode(200)
  @RequiredService('SendPushNotice')
  @ApiOperation({
    summary: 'Aviso a los jurados con equipos pendientes por calificar',
    description:
      'Solo a los jurados de la edición activa con pendientes. El texto es fijo y no dice cuáles. Si las evaluaciones están cerradas responde 403. Responde por jurado.',
  })
  @ApiNoticeResponses()
  sendPendingEvaluations(@GetUser('id') adminId: string) {
    return this.notices.sendPendingEvaluations(adminId);
  }
}
