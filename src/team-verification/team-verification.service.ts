import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { assertEditionWritable } from '../editions/active-edition';
import { EditionStatus, Prisma, TeamVerificationAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyTeamDto } from './dto/verify-team.dto';
import {
  generateUniqueVerificationCode,
  isCollegeTeamCode,
} from './verification-code.util';
import { ACTIVE_EDITION_WHERE } from '../editions/active-edition';
import { activeEditionTeamOfLeaderOrMember } from '../teams/active-edition-team';
import {
  NOT_GRADABLE_NO_CODE_MESSAGE,
  TEAM_NOT_GRADABLE,
} from '../teams/team-gradable';
import {
  VERIFICATION_RULE_SELECT,
  requiresVerificationCode,
} from './verification-rule';

export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MINUTES = 10;
export const UNVERIFIED_TEAM_MESSAGE =
  'Debes digitar el código de verificación del grupo antes de calificarlo.';

@Injectable()
export class TeamVerificationService {
  private readonly logger = new Logger(TeamVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * El jurado digita el código del grupo. Se pide una vez: al validarlo queda guardada la
   * verificación (jurado, equipo) y las evaluaciones siguientes ya no lo piden.
   */
  async verify(jurorId: string, dto: VerifyTeamDto) {
    const team = await this.prisma.team.findFirst({
      where: {
        id: dto.teamId,
        isActive: true,
        edition: ACTIVE_EDITION_WHERE,
      },
      select: {
        id: true,
        ...VERIFICATION_RULE_SELECT,
        assignedJurors: { where: { id: jurorId }, select: { id: true } },
      },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado en la edición activa');
    }

    // HU-50: N0, sin código, o código desactivado (en el equipo o en toda la edición).
    if (!requiresVerificationCode(team) || !team.verificationCode) {
      return { verified: true, required: false };
    }

    if (team.assignedJurors.length === 0) {
      throw new ForbiddenException('Este grupo no está asignado al jurado');
    }

    const verificationCode = team.verificationCode;
    const outcome = await this.prisma.$transaction(async (tx) => {
      // Candado por (equipo, jurado) hasta el fin de la transacción: los intentos simultáneos del
      // mismo jurado sobre el mismo grupo se atienden en fila, así el conteo y el registro del
      // intento son atómicos y no se pueden pasar de MAX_FAILED_ATTEMPTS con peticiones en paralelo.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${team.id}::int, hashtext(${jurorId}))`;

      const alreadyVerified = await tx.teamVerification.findUnique({
        where: { teamId_jurorId: { teamId: team.id, jurorId } },
        select: { id: true },
      });
      if (alreadyVerified) {
        return { status: 'verified' as const };
      }

      const failures = await this.findRecentFailures(tx, [team.id], jurorId);
      if (this.computeLock(failures).locked) {
        return { status: 'locked' as const };
      }
      const failedAttempts = failures.length;

      if (dto.code !== verificationCode) {
        await tx.teamVerificationLog.create({
          data: {
            action: TeamVerificationAction.ATTEMPT_FAILED,
            teamId: team.id,
            userId: jurorId,
          },
        });
        const remaining = MAX_FAILED_ATTEMPTS - failedAttempts - 1;
        // El último intento permitido ya deja el grupo bloqueado: responde 429, no 400.
        return remaining <= 0
          ? { status: 'locked' as const }
          : { status: 'wrong' as const, remaining };
      }

      await tx.teamVerification.create({
        data: { teamId: team.id, jurorId },
      });
      await tx.teamVerificationLog.create({
        data: {
          action: TeamVerificationAction.ATTEMPT_SUCCESS,
          teamId: team.id,
          userId: jurorId,
        },
      });
      return { status: 'verified' as const };
    });

    // Las excepciones se lanzan fuera de la transacción para que el intento fallido quede guardado.
    if (outcome.status === 'locked') {
      throw new HttpException(
        `Demasiados intentos fallidos. Espera ${ATTEMPT_WINDOW_MINUTES} minutos para volver a intentarlo.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (outcome.status === 'wrong') {
      throw new BadRequestException(
        `El código no coincide con el grupo. Intentos restantes: ${outcome.remaining}.`,
      );
    }
    return { verified: true, required: true };
  }

  /**
   * Videojuegos de `videogameIds` cuyo equipo exige código y que el jurado aún no verificó.
   * Una sola consulta por lista (sin N+1); lo usan las evaluaciones individual y por lote.
   */
  async findUnverifiedVideogameIds(
    jurorId: string,
    videogameIds: number[],
  ): Promise<Set<number>> {
    const videogames = await this.prisma.videogame.findMany({
      where: { id: { in: videogameIds } },
      select: {
        id: true,
        team: {
          select: {
            id: true,
            ...VERIFICATION_RULE_SELECT,
            verifications: { where: { jurorId }, select: { id: true } },
          },
        },
      },
    });

    const unverified = new Set<number>();
    for (const { id, team } of videogames) {
      if (requiresVerificationCode(team) && team.verifications.length === 0) {
        unverified.add(id);
      }
    }
    return unverified;
  }

  /**
   * Para cada equipo pedido: ¿puede el jurado calificarlo ya? `true` si lo verificó o si el
   * equipo no exige código (N0). Solo habla del jurado de la sesión y de la edición activa.
   */
  async getStatus(
    jurorId: string,
    teamIds: number[],
  ): Promise<Record<number, boolean>> {
    return (await this.getStatusWithRequired(jurorId, teamIds)).status;
  }

  /**
   * `status` como en getStatus y, por equipo, `required`: si hoy se le pide el código al jurado
   * (HU-50). Un id que no existe en la edición activa sale `status: false`, `required: true`.
   */
  async getStatusWithRequired(
    jurorId: string,
    teamIds: number[],
  ): Promise<{
    status: Record<number, boolean>;
    required: Record<number, boolean>;
  }> {
    const teams = await this.prisma.team.findMany({
      where: {
        id: { in: teamIds },
        isActive: true,
        edition: ACTIVE_EDITION_WHERE,
      },
      select: {
        id: true,
        ...VERIFICATION_RULE_SELECT,
        verifications: { where: { jurorId }, select: { id: true } },
      },
    });

    const status: Record<number, boolean> = {};
    const required: Record<number, boolean> = {};
    for (const id of teamIds) {
      status[id] = false;
      required[id] = true;
    }
    for (const team of teams) {
      const requiresCode = requiresVerificationCode(team);
      required[team.id] = requiresCode;
      status[team.id] = !requiresCode || team.verifications.length > 0;
    }
    return { status, required };
  }

  /**
   * HU-50 (ARK-314): el Administrador desactiva o vuelve a activar el código de un equipo.
   * Volver a activarlo no regenera el código ni borra las verificaciones hechas. Solo registra
   * (quién y cuándo) si el valor cambia; repetir el mismo valor no hace nada.
   */
  async setRequired(teamId: number, required: boolean, adminId: string) {
    const team = await this.findTeamForAdmin(teamId);
    assertEditionWritable(team.edition, 'el equipo');

    if (team.verificationRequired === required) {
      return { teamId, verificationRequired: required, changed: false };
    }

    await this.prisma.$transaction([
      this.prisma.team.update({
        where: { id: teamId },
        data: { verificationRequired: required },
      }),
      this.prisma.teamVerificationLog.create({
        data: {
          action: required
            ? TeamVerificationAction.CODE_ENABLED
            : TeamVerificationAction.CODE_DISABLED,
          teamId,
          userId: adminId,
        },
      }),
    ]);

    this.logger.log(
      `Código del equipo ${teamId} ${required ? 'activado' : 'desactivado'} por ${adminId}`,
    );
    return { teamId, verificationRequired: required, changed: true };
  }

  /**
   * Bloqueo por intentos de cada equipo pedido para el jurado de la sesión. Los grupos ya
   * verificados y los sin fallos recientes salen `locked: false`.
   */
  async getLocks(
    jurorId: string,
    teamIds: number[],
  ): Promise<Record<number, { locked: boolean; lockedUntil: string | null }>> {
    const [verified, failures] = await Promise.all([
      this.prisma.teamVerification.findMany({
        where: { jurorId, teamId: { in: teamIds } },
        select: { teamId: true },
      }),
      this.findRecentFailures(this.prisma, teamIds, jurorId),
    ]);
    const verifiedIds = new Set(verified.map((v) => v.teamId));

    const locks: Record<
      number,
      { locked: boolean; lockedUntil: string | null }
    > = {};
    for (const id of teamIds) {
      locks[id] = verifiedIds.has(id)
        ? { locked: false, lockedUntil: null }
        : this.computeLock(failures.filter((f) => f.teamId === id));
    }
    return locks;
  }

  async assertVerified(jurorId: string, videogameId: number) {
    const unverified = await this.findUnverifiedVideogameIds(jurorId, [
      videogameId,
    ]);
    if (unverified.has(videogameId)) {
      throw new ForbiddenException(UNVERIFIED_TEAM_MESSAGE);
    }
  }

  /**
   * Panel del estudiante: el código de su equipo (null en equipos de colegios).
   * El equipo es el que lidera en la edición activa o, si no es líder, aquel en el que es
   * integrante activo (por su correo): el integrante también se lo dice al jurado en el stand.
   * ARK-257 (BG-57): un equipo no calificable es un presentador externo; nadie le dice el código a
   * un jurado, así que no se entrega (`verificationCode: null`) y `notGradable: true` deja que el
   * front muestre el aviso en lugar del panel.
   */
  async getCodeForStudent(userId: string, email?: string | null) {
    const team = await this.prisma.team.findFirst({
      where: {
        ...activeEditionTeamOfLeaderOrMember(userId, email),
        isActive: true,
      },
      select: {
        id: true,
        teamCode: true,
        verificationCode: true,
        notGradable: true,
      },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado para este usuario');
    }

    return {
      teamId: team.id,
      teamCode: team.teamCode,
      verificationCode: team.notGradable ? null : team.verificationCode,
      notGradable: team.notGradable,
    };
  }

  async getCodeForAdmin(teamId: number, adminId: string) {
    const team = await this.findTeamForAdmin(teamId);
    await this.prisma.teamVerificationLog.create({
      data: {
        action: TeamVerificationAction.CODE_VIEWED,
        teamId,
        userId: adminId,
      },
    });
    return { teamId, code: team.verificationCode };
  }

  async regenerate(teamId: number, adminId: string) {
    const team = await this.findTeamForAdmin(teamId);
    // ARK-130 (HU-27): el código de un equipo de una edición anterior no se cambia
    assertEditionWritable(team.edition, 'el equipo');

    const code = await generateUniqueVerificationCode(
      this.prisma,
      team.editionId,
    );

    await this.prisma.$transaction([
      this.prisma.team.update({
        where: { id: teamId },
        data: { verificationCode: code },
      }),
      this.prisma.teamVerificationLog.create({
        data: {
          action: TeamVerificationAction.CODE_REGENERATED,
          teamId,
          userId: adminId,
        },
      }),
    ]);

    this.logger.log(`Código del equipo ${teamId} regenerado por ${adminId}`);
    return { teamId, code };
  }

  private async findTeamForAdmin(teamId: number) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, isActive: true },
      select: {
        id: true,
        editionId: true,
        teamCode: true,
        verificationCode: true,
        verificationRequired: true,
        notGradable: true,
        edition: { select: { status: true, title: true } },
      },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado');
    }
    if (isCollegeTeamCode(team.teamCode)) {
      throw new BadRequestException(
        'Los equipos de colegios (N0) no tienen código de verificación',
      );
    }
    // ARK-257 (BG-57): un presentador externo no se califica; su código no se consulta ni se cambia
    if (team.notGradable) {
      throw new BadRequestException({
        statusCode: 400,
        code: TEAM_NOT_GRADABLE,
        message: NOT_GRADABLE_NO_CODE_MESSAGE,
      });
    }
    return team;
  }

  /** Fallos de la ventana de bloqueo, del más reciente al más antiguo, por equipo. */
  private async findRecentFailures(
    client: Prisma.TransactionClient | PrismaService,
    teamIds: number[],
    userId: string,
  ): Promise<{ teamId: number; createdAt: Date }[]> {
    const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
    return client.teamVerificationLog.findMany({
      where: {
        teamId: { in: teamIds },
        userId,
        action: TeamVerificationAction.ATTEMPT_FAILED,
        createdAt: { gte: since },
      },
      select: { teamId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Regla única de bloqueo (la usan `verify` y `getLocks`): bloqueado con MAX_FAILED_ATTEMPTS
   * fallos dentro de la ventana. Se libera cuando el 5.º fallo más reciente sale de la ventana.
   * `failures` debe ser de un solo equipo y venir del más reciente al más antiguo.
   */
  private computeLock(failures: { createdAt: Date }[]): {
    locked: boolean;
    lockedUntil: string | null;
  } {
    if (failures.length < MAX_FAILED_ATTEMPTS) {
      return { locked: false, lockedUntil: null };
    }
    const decisive = failures[MAX_FAILED_ATTEMPTS - 1].createdAt;
    return {
      locked: true,
      lockedUntil: new Date(
        decisive.getTime() + ATTEMPT_WINDOW_MINUTES * 60 * 1000,
      ).toISOString(),
    };
  }
}
