import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ActiveEdition,
  requireActiveEdition,
} from '../editions/active-edition';
import { jurorsOfEdition } from '../juror-edition/jurors-of-edition';
import { VideogamesService } from '../pending-games/pg.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ARRIVAL_REMINDER_NOTICE,
  PENDING_EVALUATIONS_NOTICE,
} from './push-messages';
import { PushNoticeInput } from './push-notice';
import { PushSenderService } from './push-sender.service';

export const PUSH_DISABLED = 'PUSH_DISABLED';

/** Cuántos conteos de pendientes se piden a la vez a la base de datos. */
const PENDING_COUNT_BATCH = 25;

/**
 * HU-37: avisos que dispara el administrador a mano, siempre a jurados de la edición activa y con
 * texto fijo (Allison, 7-nov): no hay aviso de texto libre, porque no se puede garantizar que no
 * lleve nombres de equipos.
 */
@Injectable()
export class PushNoticesService {
  private readonly logger = new Logger(PushNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: PushSenderService,
    private readonly pendingGames: VideogamesService,
  ) {}

  /** Solo a quienes no tienen llegada activa en `asistencia_jurado` en esta edición. */
  async sendArrivalReminder(adminId: string) {
    this.assertEnabled();
    const edition = await requireActiveEdition(this.prisma);
    const jurorIds = await this.findJurorIds({
      ...jurorsOfEdition(edition.id),
      attendances: { none: { editionId: edition.id, isActive: true } },
    });
    return this.sendAndReport(
      edition,
      jurorIds,
      ARRIVAL_REMINDER_NOTICE,
      adminId,
    );
  }

  /**
   * Solo a quienes tienen pendientes, con el mismo conteo que ve el jurado en su lista. Ese conteo
   * responde 403 si las evaluaciones están cerradas: entonces no se envía nada.
   */
  async sendPendingEvaluations(adminId: string) {
    this.assertEnabled();
    const edition = await requireActiveEdition(this.prisma);
    const candidates = await this.findJurorIds(jurorsOfEdition(edition.id));
    const jurorIds: string[] = [];
    for (let i = 0; i < candidates.length; i += PENDING_COUNT_BATCH) {
      const batch = candidates.slice(i, i + PENDING_COUNT_BATCH);
      const counts = await Promise.all(
        batch.map((id) => this.pendingGames.getPendingVideogamesCount(id)),
      );
      jurorIds.push(...batch.filter((_, index) => counts[index] > 0));
    }
    return this.sendAndReport(
      edition,
      jurorIds,
      PENDING_EVALUATIONS_NOTICE,
      adminId,
    );
  }

  /** Sin esto el administrador vería una respuesta exitosa sin que saliera ningún aviso. */
  private assertEnabled(): void {
    if (this.sender.isEnabled()) return;
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: PUSH_DISABLED,
      message: 'Las notificaciones push no están configuradas en el servidor',
    });
  }

  private async findJurorIds(where: Prisma.UserWhereInput): Promise<string[]> {
    const jurors = await this.prisma.user.findMany({
      where,
      select: { id: true },
    });
    return jurors.map((juror) => juror.id);
  }

  private async sendAndReport(
    edition: ActiveEdition,
    jurorIds: string[],
    notice: PushNoticeInput,
    adminId: string,
  ) {
    const { totals, results } = await this.sender.sendToUsers(jurorIds, notice);

    // Sin el texto del aviso: los registros guardan quién y cuántos, no el contenido.
    this.logger.log(
      `El administrador ${adminId} envió un aviso a ${jurorIds.length} jurados de la edición ${edition.id}`,
    );
    return {
      edition: { id: edition.id, title: edition.title },
      totals: { jurors: jurorIds.length, ...totals },
      results: results.map(({ userId, ...counts }) => ({
        jurorId: userId,
        ...counts,
      })),
    };
  }
}
