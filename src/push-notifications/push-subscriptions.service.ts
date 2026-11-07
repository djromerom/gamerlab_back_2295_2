import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import {
  isAllowedPushEndpoint,
  PUSH_ENDPOINT_NOT_ALLOWED,
} from './push-endpoint-policy';
import { VapidConfigService } from './vapid-config.service';

/**
 * HU-37: suscripciones del propio usuario, una por dispositivo. El id del usuario siempre sale
 * de la sesión: ninguna ruta recibe un usuario ni devuelve la dirección de otro dispositivo.
 */
@Injectable()
export class PushSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vapid: VapidConfigService,
  ) {}

  getPublicKey() {
    return {
      enabled: this.vapid.isEnabled(),
      publicKey: this.vapid.getPublicKey(),
    };
  }

  async getStatus(userId: string) {
    return {
      enabled: this.vapid.isEnabled(),
      devices: await this.countDevices(userId),
    };
  }

  /**
   * Idempotente. Si el dispositivo ya estaba registrado, pasa al usuario actual: en un celular
   * compartido, el aviso debe llegarle a quien inició sesión por última vez y no al anterior.
   * Solo quien tiene la suscripción del navegador conoce esa dirección, que nunca se expone.
   */
  async subscribe(userId: string, dto: SubscribePushDto) {
    if (!isAllowedPushEndpoint(dto.endpoint)) {
      throw new BadRequestException({
        statusCode: 400,
        code: PUSH_ENDPOINT_NOT_ALLOWED,
        message: 'Este navegador usa un servicio de notificaciones no admitido',
      });
    }
    const keys = { p256dh: dto.keys.p256dh, auth: dto.keys.auth };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, ...keys },
      update: { userId, isActive: true, ...keys },
      select: { id: true },
    });
    return { subscribed: true, devices: await this.countDevices(userId) };
  }

  /**
   * Borrado lógico. El filtro por usuario hace que una dirección ajena no cambie nada, y la
   * respuesta es la misma que si no existiera: no revela de quién es.
   */
  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.updateMany({
      where: { endpoint, userId, isActive: true },
      data: { isActive: false },
    });
    return { subscribed: false, devices: await this.countDevices(userId) };
  }

  private countDevices(userId: string): Promise<number> {
    return this.prisma.pushSubscription.count({
      where: { userId, isActive: true },
    });
  }
}
