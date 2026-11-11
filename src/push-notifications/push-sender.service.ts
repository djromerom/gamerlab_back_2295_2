import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { buildPushNotice, PushNoticeInput } from './push-notice';
import { VapidConfigService } from './vapid-config.service';

/** Cuánto guarda el servicio de push un aviso si el celular está apagado. */
const NOTICE_TTL_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;
const CONCURRENT_REQUESTS = 25;
/** El servicio de push dice que la suscripción ya no existe: no volverá a funcionar. */
const EXPIRED_STATUS_CODES = [404, 410];

export interface PushUserResult {
  userId: string;
  devices: number;
  sent: number;
  /** Suscripciones vencidas que se eliminaron en este envío. */
  expired: number;
  failed: number;
}

export interface PushSendResult {
  /** `false` si faltan las claves VAPID: no se intentó enviar nada. */
  enabled: boolean;
  totals: { devices: number; sent: number; expired: number; failed: number };
  results: PushUserResult[];
}

type DeviceOutcome = 'sent' | 'expired' | 'failed';

/**
 * HU-37: envío reutilizable de avisos push. Cada dispositivo se resuelve por separado: uno que
 * falla no detiene a los demás, y los errores de envío no se propagan.
 *
 * Un disparador automático no llama aquí directamente: usa `AssignmentPushNotifier`, que no
 * espera el resultado y no deja pasar ningún error a la operación que lo originó.
 */
@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vapid: VapidConfigService,
  ) {}

  isEnabled(): boolean {
    return this.vapid.isEnabled();
  }

  async sendToUsers(
    userIds: string[],
    input: PushNoticeInput,
  ): Promise<PushSendResult> {
    const payload = JSON.stringify(buildPushNotice(input));
    const byUser = new Map<string, PushUserResult>(
      [...new Set(userIds)].map((userId) => [
        userId,
        { userId, devices: 0, sent: 0, expired: 0, failed: 0 },
      ]),
    );

    if (!this.vapid.isEnabled()) {
      this.logger.warn('Aviso push omitido: el envío está desactivado');
      return this.toResult(false, byUser);
    }
    if (byUser.size === 0) return this.toResult(true, byUser);

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        userId: { in: [...byUser.keys()] },
        isActive: true,
        user: { isActive: true },
      },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });

    const expiredIds: number[] = [];
    for (let i = 0; i < subscriptions.length; i += CONCURRENT_REQUESTS) {
      const batch = subscriptions.slice(i, i + CONCURRENT_REQUESTS);
      const outcomes = await Promise.all(
        batch.map((subscription) => this.sendOne(subscription, payload)),
      );
      batch.forEach((subscription, index) => {
        const outcome = outcomes[index];
        const row = byUser.get(subscription.userId)!;
        row.devices += 1;
        row[outcome] += 1;
        if (outcome === 'expired') expiredIds.push(subscription.id);
      });
    }

    await this.removeExpired(expiredIds);
    const result = this.toResult(true, byUser);
    this.logger.log(
      `Aviso push: ${result.totals.devices} dispositivos, ${result.totals.sent} enviados, ${result.totals.expired} vencidos, ${result.totals.failed} con error`,
    );
    return result;
  }

  private async sendOne(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: string,
  ): Promise<DeviceOutcome> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        {
          TTL: NOTICE_TTL_SECONDS,
          urgency: 'high',
          timeout: REQUEST_TIMEOUT_MS,
        },
      );
      return 'sent';
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode && EXPIRED_STATUS_CODES.includes(statusCode)) {
        return 'expired';
      }
      // El endpoint identifica al dispositivo y funciona como credencial: no va a los registros.
      this.logger.warn(
        `Falló un aviso push (${statusCode ?? 'sin respuesta del servicio de push'})`,
      );
      return 'failed';
    }
  }

  /**
   * Borrado físico a propósito (criterio de HU-37: «las suscripciones vencidas se eliminan»).
   * El servicio de push confirmó que la dirección no volverá a existir, y si el navegador se
   * suscribe de nuevo recibe otra dirección: la fila no sirve para nada ni es historial.
   */
  private async removeExpired(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: ids } },
      });
    } catch (error) {
      // Se corrige solo: el próximo envío volverá a recibir 404/410.
      this.logger.error(
        `No se pudieron eliminar ${ids.length} suscripciones vencidas: ${(error as Error).name}`,
      );
    }
  }

  private toResult(
    enabled: boolean,
    byUser: Map<string, PushUserResult>,
  ): PushSendResult {
    const results = [...byUser.values()];
    const totals = { devices: 0, sent: 0, expired: 0, failed: 0 };
    for (const row of results) {
      totals.devices += row.devices;
      totals.sent += row.sent;
      totals.expired += row.expired;
      totals.failed += row.failed;
    }
    return { enabled, totals, results };
  }
}
