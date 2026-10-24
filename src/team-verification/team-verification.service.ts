import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EditionStatus, TeamVerificationAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyTeamDto } from './dto/verify-team.dto';
import {
  generateUniqueVerificationCode,
  isCollegeTeamCode,
} from './verification-code.util';

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
        edition: { status: EditionStatus.ACTIVE },
      },
      select: {
        id: true,
        teamCode: true,
        verificationCode: true,
        assignedJurors: { where: { id: jurorId }, select: { id: true } },
      },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado en la edición activa');
    }

    if (!team.verificationCode || isCollegeTeamCode(team.teamCode)) {
      return { verified: true, required: false };
    }

    if (team.assignedJurors.length === 0) {
      throw new ForbiddenException('Este grupo no está asignado al jurado');
    }

    const alreadyVerified = await this.prisma.teamVerification.findUnique({
      where: { teamId_jurorId: { teamId: team.id, jurorId } },
      select: { id: true },
    });
    if (alreadyVerified) {
      return { verified: true, required: true };
    }

    const failedAttempts = await this.countRecentFailedAttempts(
      team.id,
      jurorId,
    );
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      throw new HttpException(
        `Demasiados intentos fallidos. Espera ${ATTEMPT_WINDOW_MINUTES} minutos para volver a intentarlo.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (dto.code !== team.verificationCode) {
      await this.prisma.teamVerificationLog.create({
        data: {
          action: TeamVerificationAction.ATTEMPT_FAILED,
          teamId: team.id,
          userId: jurorId,
        },
      });
      const remaining = MAX_FAILED_ATTEMPTS - failedAttempts - 1;
      throw new BadRequestException(
        `El código no coincide con el grupo. Intentos restantes: ${remaining}.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.teamVerification.upsert({
        where: { teamId_jurorId: { teamId: team.id, jurorId } },
        create: { teamId: team.id, jurorId },
        update: {},
      }),
      this.prisma.teamVerificationLog.create({
        data: {
          action: TeamVerificationAction.ATTEMPT_SUCCESS,
          teamId: team.id,
          userId: jurorId,
        },
      }),
    ]);

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
            teamCode: true,
            verificationCode: true,
            verifications: { where: { jurorId }, select: { id: true } },
          },
        },
      },
    });

    const unverified = new Set<number>();
    for (const { id, team } of videogames) {
      const requiresCode =
        !!team.verificationCode && !isCollegeTeamCode(team.teamCode);
      if (requiresCode && team.verifications.length === 0) {
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
    const teams = await this.prisma.team.findMany({
      where: {
        id: { in: teamIds },
        isActive: true,
        edition: { status: EditionStatus.ACTIVE },
      },
      select: {
        id: true,
        teamCode: true,
        verificationCode: true,
        verifications: { where: { jurorId }, select: { id: true } },
      },
    });

    const status: Record<number, boolean> = {};
    for (const id of teamIds) status[id] = false;
    for (const team of teams) {
      const requiresCode =
        !!team.verificationCode && !isCollegeTeamCode(team.teamCode);
      status[team.id] = !requiresCode || team.verifications.length > 0;
    }
    return status;
  }

  async assertVerified(jurorId: string, videogameId: number) {
    const unverified = await this.findUnverifiedVideogameIds(jurorId, [
      videogameId,
    ]);
    if (unverified.has(videogameId)) {
      throw new ForbiddenException(UNVERIFIED_TEAM_MESSAGE);
    }
  }

  /** Panel del estudiante: el código de su equipo (null en equipos de colegios). */
  async getCodeForStudent(userId: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        userId,
        isActive: true,
        edition: { status: EditionStatus.ACTIVE },
      },
      select: { id: true, teamCode: true, verificationCode: true },
    });

    if (!team) {
      throw new NotFoundException('Equipo no encontrado para este usuario');
    }

    return {
      teamId: team.id,
      teamCode: team.teamCode,
      verificationCode: team.verificationCode,
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
    return team;
  }

  private countRecentFailedAttempts(teamId: number, userId: string) {
    const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
    return this.prisma.teamVerificationLog.count({
      where: {
        teamId,
        userId,
        action: TeamVerificationAction.ATTEMPT_FAILED,
        createdAt: { gte: since },
      },
    });
  }
}
