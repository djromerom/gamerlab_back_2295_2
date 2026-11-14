import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JurorEditionStatus,
  JurorType,
  Prisma,
  SubstituteNoticeEmailStatus,
} from '@prisma/client';
import { requireActiveEdition } from '../editions/active-edition';
import { EmailService } from '../email/email.service';
import { extractTeamLevel } from '../juror/assignment-validation/assignment-rules';
import { JUROR_ROLE_NAME } from '../juror-badges/juror-label';
import { PrismaService } from '../prisma/prisma.service';
import { NoticeStatusFilter } from './dto/list-my-notices-query.dto';
import {
  SUBSTITUTE_NOTICE_MESSAGE,
  SUBSTITUTE_NOTICE_NOT_FOUND,
  byUnreadThenNewest,
  noticeSelect,
  shortEmailError,
  toNoticeItem,
  toNoticeTeams,
} from './substitute-notice-view';

/** Plantilla del correo (`src/email/templates/substitute_notice.hbs`). */
export const SUBSTITUTE_NOTICE_TEMPLATE = 'substitute_notice';

/** Pantalla del suplente con sus grupos pendientes por calificar. */
const PENDING_GRADING_PATH = '/pendientes-calificar';

export interface RecordAssignmentInput {
  jurorId: string;
  /** Equipos de la misma operación: todos van en un solo aviso. */
  teamIds: number[];
  editionId: number;
}

/**
 * HU-22 (ARK-84): aviso "Te asignaron grupos" al suplente.
 *
 * Solo genera aviso la asignación de grupos a un SUPLENTE: jurado (rol Jurado) confirmado en la
 * edición con tipo BACKUP. Los oficiales y los profesores no reciben aviso. Una operación que
 * asigna varios equipos al mismo suplente produce UN aviso con todos ellos (HU-09 lo usará en
 * lote). Quitar grupos no crea avisos ni borra los existentes.
 *
 * El aviso queda hasta que el suplente lo marca como leído. El correo (Azure ACS) sale después de
 * confirmar la transacción y nunca hace fallar la asignación: si falla, se guarda el motivo y el
 * aviso en la plataforma sigue activo. El "Entendido" del texto explicativo lo guarda el front.
 */
@Injectable()
export class SubstituteNoticesService {
  private readonly logger = new Logger(SubstituteNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Dentro de la transacción de quien asigna. Devuelve el id del aviso creado, o `null` si el
   * jurado no es suplente de la edición o no hay equipos.
   */
  async recordAssignment(
    tx: Prisma.TransactionClient,
    { jurorId, teamIds, editionId }: RecordAssignmentInput,
  ): Promise<number | null> {
    const uniqueTeamIds = [...new Set(teamIds)];
    if (uniqueTeamIds.length === 0) return null;

    const substitute = await tx.jurorEdition.findFirst({
      where: {
        jurorId,
        editionId,
        type: JurorType.BACKUP,
        status: JurorEditionStatus.CONFIRMED,
        juror: { isActive: true, role: { name: JUROR_ROLE_NAME } },
      },
      select: { id: true },
    });
    if (!substitute) return null;

    const teams = await tx.team.findMany({
      where: { id: { in: uniqueTeamIds }, editionId },
      select: {
        id: true,
        teamCode: true,
        teamName: true,
        videogame: { select: { name: true } },
      },
    });
    if (teams.length === 0) return null;

    const notice = await tx.substituteNotice.create({
      data: {
        jurorId,
        editionId,
        teams: {
          create: teams.map((team) => ({
            teamId: team.id,
            teamCode: team.teamCode,
            teamName: team.teamName,
            videogameName: team.videogame?.name ?? null,
            level: extractTeamLevel(team.teamCode),
          })),
        },
      },
      select: { id: true },
    });
    return notice.id;
  }

  /**
   * Después de confirmar la transacción. Síncrono y sin promesa a propósito (igual que el aviso
   * push de HU-37): la petición no espera al correo y ningún error sale de aquí.
   */
  sendEmailAfterCommit(noticeIds: Array<number | null | undefined>): void {
    const ids = [
      ...new Set(noticeIds.filter((id): id is number => typeof id === 'number')),
    ];
    if (ids.length === 0) return;
    void Promise.resolve()
      .then(async () => {
        for (const id of ids) await this.sendNoticeEmail(id);
      })
      .catch((error: unknown) => {
        this.logger.error(
          `No se pudo procesar el correo de los avisos a suplentes: ${(error as Error)?.name}`,
        );
      });
  }

  /** Envía el correo de un aviso y guarda SENT, SKIPPED o FAILED. Nunca lanza. */
  async sendNoticeEmail(noticeId: number): Promise<SubstituteNoticeEmailStatus> {
    let status: SubstituteNoticeEmailStatus = SubstituteNoticeEmailStatus.FAILED;
    let emailError: string | null = null;
    try {
      const notice = await this.prisma.substituteNotice.findUnique({
        where: { id: noticeId },
        select: {
          ...noticeSelect,
          juror: { select: { firstName: true, email: true } },
        },
      });
      if (!notice) return status;

      const frontendUrl = this.configService
        .get<string>('FRONTEND_URL', 'http://localhost:5173')
        .replace(/\/+$/, '');
      // Solo datos del propio suplente y de los grupos: nada de integrantes ni de otros jurados.
      await this.emailService.sendEmail(
        notice.juror.email,
        SUBSTITUTE_NOTICE_MESSAGE,
        SUBSTITUTE_NOTICE_TEMPLATE,
        {
          firstName: notice.juror.firstName,
          message: SUBSTITUTE_NOTICE_MESSAGE,
          teams: toNoticeTeams(notice.teams),
          pendingUrl: `${frontendUrl}${PENDING_GRADING_PATH}`,
        },
      );
      // Sin claves de ACS (desarrollo) sendEmail no envía nada: se registra como omitido.
      if (this.emailService.isConfigured()) {
        status = SubstituteNoticeEmailStatus.SENT;
      } else {
        status = SubstituteNoticeEmailStatus.SKIPPED;
        emailError = 'Correo no configurado (modo simulación): no se envió.';
      }
    } catch (error) {
      status = SubstituteNoticeEmailStatus.FAILED;
      emailError = shortEmailError(error);
      this.logger.warn(
        `No se pudo enviar el correo del aviso ${noticeId} al suplente: ${emailError}`,
      );
    }

    try {
      await this.prisma.substituteNotice.update({
        where: { id: noticeId },
        data: { emailStatus: status, emailError },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo guardar el estado del correo del aviso ${noticeId}: ${(error as Error)?.name}`,
      );
    }
    return status;
  }

  /** Avisos del usuario en la edición activa; por defecto solo los sin leer. */
  async findMine(
    userId: string,
    status: NoticeStatusFilter = 'unread',
    now: Date = new Date(),
  ) {
    const edition = await requireActiveEdition(this.prisma);
    const where: Prisma.SubstituteNoticeWhereInput = {
      jurorId: userId,
      editionId: edition.id,
    };
    const [notices, unreadCount] = await Promise.all([
      this.prisma.substituteNotice.findMany({
        where: status === 'all' ? where : { ...where, readAt: null },
        select: noticeSelect,
      }),
      this.prisma.substituteNotice.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      edition: { id: edition.id, title: edition.title },
      serverTime: now,
      unreadCount,
      data: [...notices].sort(byUnreadThenNewest).map(toNoticeItem),
    };
  }

  /** Marca el aviso como leído. Solo el dueño; repetirlo no cambia la hora. 404 si no es suyo. */
  async markRead(userId: string, noticeId: number, now: Date = new Date()) {
    const owned = { id: noticeId, jurorId: userId };
    const { count } = await this.prisma.substituteNotice.updateMany({
      where: { ...owned, readAt: null },
      data: { readAt: now },
    });
    const notice = await this.prisma.substituteNotice.findFirst({
      where: owned,
      select: noticeSelect,
    });
    if (!notice) {
      throw new NotFoundException({
        statusCode: 404,
        code: SUBSTITUTE_NOTICE_NOT_FOUND,
        message: 'El aviso no existe o no es tuyo.',
      });
    }
    if (count > 0) {
      this.logger.log(`Aviso ${noticeId} marcado como leído.`);
    }
    return toNoticeItem(notice);
  }

  /** Panel de seguimiento: avisos sin leer de la edición activa, el más antiguo primero. */
  async listUnread(now: Date = new Date()) {
    const edition = await requireActiveEdition(this.prisma);
    const notices = await this.prisma.substituteNotice.findMany({
      where: { editionId: edition.id, readAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        jurorId: true,
        createdAt: true,
        emailStatus: true,
        juror: { select: { firstName: true, lastName: true } },
        _count: { select: { teams: true } },
      },
    });
    return {
      edition: { id: edition.id, title: edition.title },
      serverTime: now,
      totals: {
        unread: notices.length,
        jurors: new Set(notices.map((n) => n.jurorId)).size,
      },
      data: notices.map((notice) => ({
        noticeId: notice.id,
        jurorId: notice.jurorId,
        name: `${notice.juror.firstName ?? ''} ${notice.juror.lastName ?? ''}`.trim(),
        createdAt: notice.createdAt,
        teamCount: notice._count.teams,
        emailStatus: notice.emailStatus,
      })),
    };
  }
}
