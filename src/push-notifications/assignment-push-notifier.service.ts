import { Injectable, Logger } from '@nestjs/common';
import { findActiveEdition } from '../editions/active-edition';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { PrismaService } from '../prisma/prisma.service';
import {
  ASSIGNMENT_CHANGED_NOTICE,
  teamsAssignedNotice,
} from './push-messages';
import { PushNoticeInput, buildPushNotice } from './push-notice';
import { PushSenderService } from './push-sender.service';

/**
 * HU-37: aviso de nueva asignación o cambio de equipos. Se llama después de confirmar la
 * transacción. Es síncrono y no devuelve promesa a propósito: la asignación no espera al servicio
 * de push, y ningún error de envío ni la falta de claves VAPID puede hacerla fallar.
 *
 * Solo llega a quienes son jurados de la edición activa (`jurorsOfEdition`, Allison, 7-nov): al
 * quitarle un equipo a quien ya declinó, por ejemplo, no se le avisa.
 *
 * HU-51 (ARK-292): al asignar grupos nuevos (manual, automática, suplentes, contingencia y último
 * momento) se usa `notifyTeamsAssigned`, que dice cuántos y cuáles. Quitar o reasignar sigue con
 * el aviso genérico (`notifyAssignmentChanged`).
 *
 * Para retirarlo: quitar las llamadas en `juror-assignment.service.ts` y
 * `automatic-assignment.service.ts`, y esta clase.
 */
@Injectable()
export class AssignmentPushNotifier {
  private readonly logger = new Logger(AssignmentPushNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: PushSenderService,
  ) {}

  /** A lo sumo un aviso por jurado, aunque aparezca varias veces en la lista. */
  notifyAssignmentChanged(jurorIds: string[]): void {
    this.inBackground(async () => {
      const recipients = await this.recipients(jurorIds);
      if (recipients.length === 0) return;
      await this.sender.sendToUsers(recipients, ASSIGNMENT_CHANGED_NOTICE);
    });
  }

  /**
   * HU-51: un solo aviso por jurado con los grupos nuevos de esta operación, aunque sean varios
   * (asignación automática, suplentes o contingencia).
   */
  notifyTeamsAssigned(
    assignments: { jurorId: string; teamId: number }[],
  ): void {
    this.inBackground(async () => {
      const teamsByJuror = new Map<string, Set<number>>();
      for (const { jurorId, teamId } of assignments) {
        const teams = teamsByJuror.get(jurorId) ?? new Set<number>();
        teams.add(teamId);
        teamsByJuror.set(jurorId, teams);
      }
      const recipients = await this.recipients([...teamsByJuror.keys()]);
      if (recipients.length === 0) return;

      const teamIds = [...new Set(assignments.map((a) => a.teamId))];
      const teams = await this.prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, teamCode: true },
      });
      const codeById = new Map(teams.map((team) => [team.id, team.teamCode]));

      await Promise.all(
        recipients.map((jurorId) => {
          const codes = [...teamsByJuror.get(jurorId)!].flatMap((id) => {
            const code = codeById.get(id);
            return code ? [code] : [];
          });
          return this.sender.sendToUsers([jurorId], this.noticeFor(codes));
        }),
      );
    });
  }

  /** Con un código raro (que el filtro de datos sensibles rechace) sale el aviso genérico. */
  private noticeFor(codes: string[]): PushNoticeInput {
    if (codes.length === 0) return ASSIGNMENT_CHANGED_NOTICE;
    const notice = teamsAssignedNotice(codes);
    try {
      buildPushNotice(notice);
      return notice;
    } catch {
      return ASSIGNMENT_CHANGED_NOTICE;
    }
  }

  /** Los pedidos que son jurados de la edición activa, sin repetir. */
  private async recipients(jurorIds: string[]): Promise<string[]> {
    const uniqueIds = [...new Set(jurorIds)];
    if (uniqueIds.length === 0 || !this.sender.isEnabled()) return [];
    const edition = await findActiveEdition(this.prisma);
    if (!edition) return [];
    const jurors = await this.prisma.user.findMany({
      where: jurorsOfEdition(edition.id, uniqueIds),
      select: { id: true },
    });
    const allowed = new Set(jurors.map((juror) => juror.id));
    return uniqueIds.filter((id) => allowed.has(id));
  }

  /** La asignación no espera al envío y ningún error del aviso la afecta. */
  private inBackground(send: () => Promise<void>): void {
    void Promise.resolve()
      .then(send)
      .catch((error: unknown) => {
        this.logger.error(
          `No se pudo enviar el aviso de asignación: ${(error as Error)?.name}`,
        );
      });
  }
}
