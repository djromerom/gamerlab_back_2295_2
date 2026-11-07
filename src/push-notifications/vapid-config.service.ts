import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

/**
 * HU-37: claves VAPID, leídas solo de variables de entorno. Si faltan o no son válidas (por
 * ejemplo en CI), el backend arranca igual: el envío queda desactivado y se registra.
 * Los registros nombran las variables, nunca sus valores.
 */
@Injectable()
export class VapidConfigService implements OnModuleInit {
  private readonly logger = new Logger(VapidConfigService.name);
  private publicKey: string | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject = this.config.get<string>('VAPID_SUBJECT')?.trim();

    if (!publicKey || !privateKey || !subject) {
      const missing = [
        !publicKey && 'VAPID_PUBLIC_KEY',
        !privateKey && 'VAPID_PRIVATE_KEY',
        !subject && 'VAPID_SUBJECT',
      ].filter(Boolean);
      this.logger.warn(
        `Notificaciones push desactivadas: falta ${missing.join(', ')}`,
      );
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
      this.logger.log('Notificaciones push activadas');
    } catch {
      // El mensaje de la librería puede citar lo que recibió: no se registra.
      this.logger.error(
        'Notificaciones push desactivadas: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT no tienen un formato válido',
      );
    }
  }

  isEnabled(): boolean {
    return this.publicKey !== null;
  }

  getPublicKey(): string | null {
    return this.publicKey;
  }
}
