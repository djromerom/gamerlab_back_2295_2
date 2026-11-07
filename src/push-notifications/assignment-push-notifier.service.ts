import { Injectable, Logger } from '@nestjs/common';
import { ASSIGNMENT_CHANGED_NOTICE } from './push-messages';
import { PushSenderService } from './push-sender.service';

/**
 * HU-37: aviso de nueva asignación o cambio de equipos. Se llama después de confirmar la
 * transacción. Es síncrono y no devuelve promesa a propósito: la asignación no espera al servicio
 * de push, y ningún error de envío ni la falta de claves VAPID puede hacerla fallar.
 *
 * Pendiente de confirmar con Allison. Para retirarlo: quitar las llamadas en
 * `juror-assignment.service.ts` y `automatic-assignment.service.ts`, y esta clase.
 */
@Injectable()
export class AssignmentPushNotifier {
  private readonly logger = new Logger(AssignmentPushNotifier.name);

  constructor(private readonly sender: PushSenderService) {}

  /** A lo sumo un aviso por jurado, aunque aparezca varias veces en la lista. */
  notifyAssignmentChanged(jurorIds: string[]): void {
    const uniqueIds = [...new Set(jurorIds)];
    void Promise.resolve()
      .then(async () => {
        if (uniqueIds.length === 0 || !this.sender.isEnabled()) return;
        await this.sender.sendToUsers(uniqueIds, ASSIGNMENT_CHANGED_NOTICE);
      })
      .catch((error: unknown) => {
        this.logger.error(
          `No se pudo enviar el aviso de asignación: ${(error as Error)?.name}`,
        );
      });
  }
}
