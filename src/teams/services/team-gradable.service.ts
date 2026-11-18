import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { findActiveEdition } from '../../editions/active-edition';
import { AssignmentPushNotifier } from '../../push-notifications/assignment-push-notifier.service';
import {
  CONFIRMED_VIDEOGAME_STATUS,
  ReleasedJuror,
  releaseAllJurors,
} from '../team-status';
import {
  GRADABLE_REQUIRES_CONFIRMED,
  markRequiresConfirmedMessage,
  NOT_GRADABLE_RELEASE_NOTE,
  notGradableReleaseNotice,
} from '../team-gradable';

export interface TeamGradableResult {
  id: number;
  teamCode: string;
  teamName: string;
  notGradable: boolean;
  juradosRetirados?: ReleasedJuror[];
  avisoAsignacion?: string;
}

/**
 * HU-39 (ARK-209): el administrador marca o desmarca un equipo como no calificable (presentador
 * externo que es un equipo). Ver las reglas en `team-gradable.ts`.
 */
@Injectable()
export class TeamGradableService {
  private readonly logger = new Logger(TeamGradableService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly pushNotifier?: AssignmentPushNotifier,
  ) {}

  async setNotGradable(
    teamId: number,
    notGradable: boolean,
    actorUserId: string,
  ): Promise<TeamGradableResult> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        teamCode: true,
        teamName: true,
        isActive: true,
        editionId: true,
        notGradable: true,
        videogame: {
          select: { videogameStatus: { select: { status: true } } },
        },
      },
    });
    if (!team || !team.isActive) {
      throw new NotFoundException(`Equipo con ID ${teamId} no encontrado`);
    }
    const edition = await findActiveEdition(this.prisma);
    if (!edition || team.editionId !== edition.id) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'TEAM_NOT_IN_ACTIVE_EDITION',
        message:
          'Solo se puede marcar o desmarcar un equipo de la edición activa: las ediciones anteriores son de solo lectura.',
      });
    }

    const summary = {
      id: team.id,
      teamCode: team.teamCode,
      teamName: team.teamName,
      notGradable,
    };
    // Sin cambios: no se toca la base ni se avisa a nadie
    if (team.notGradable === notGradable) return summary;

    // ARK-257 (BG-57): solo se marca un equipo Confirmado. Desmarcar siempre se permite, para
    // poder quitar la marca a un equipo que se rechazó después de marcarlo.
    const status = team.videogame?.videogameStatus?.status ?? null;
    if (notGradable && status !== CONFIRMED_VIDEOGAME_STATUS) {
      throw new BadRequestException({
        statusCode: 400,
        code: GRADABLE_REQUIRES_CONFIRMED,
        message: markRequiresConfirmedMessage(status),
      });
    }

    const released = await this.prisma.$transaction(async (tx) => {
      await tx.team.update({ where: { id: teamId }, data: { notGradable } });
      return notGradable
        ? releaseAllJurors(tx, teamId, actorUserId, NOT_GRADABLE_RELEASE_NOTE)
        : [];
    });

    // Después de confirmar la transacción y sin esperarlo (como en ARK-158 y HU-37)
    if (released.length > 0) {
      this.pushNotifier?.notifyAssignmentChanged(
        released.map((juror) => juror.id),
      );
    }
    this.logger.log(
      `Equipo ${team.teamCode} marcado como ${notGradable ? 'no calificable' : 'calificable'} (jurados retirados: ${released.length})`,
    );
    return { ...summary, ...notGradableReleaseNotice(released) };
  }
}
