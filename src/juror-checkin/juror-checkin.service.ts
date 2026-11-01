import { Injectable, NotFoundException } from '@nestjs/common';
import { CheckInMethod, EditionStatus, Prisma } from '@prisma/client';
import { JurorBadgesService } from '../juror-badges/juror-badges.service';
import {
  eligibleJurorsWhere,
  jurorCategoryLabel,
  jurorFullName,
  jurorSelect,
} from '../juror-badges/juror-label';
import { PrismaService } from '../prisma/prisma.service';

const SEARCH_LIMIT = 20;

export type CheckInStatus = 'CHECKED_IN' | 'ALREADY_CHECKED_IN';

export interface CheckInResult {
  status: CheckInStatus;
  checkedInAt: Date;
  method: CheckInMethod;
  juror: {
    id: string;
    name: string;
    category: string;
    teams: { id: number; name: string }[];
  };
}

export interface JurorSearchItem {
  id: string;
  name: string;
  category: string;
  hasBadge: boolean;
  checkedInAt: Date | null;
}

/**
 * HU-11: registro de llegada de los jurados en la mesa de escarapelas.
 * Un jurado tiene a lo sumo un registro activo por edición; repetir el registro
 * no es un error: responde ALREADY_CHECKED_IN con la hora original.
 */
@Injectable()
export class JurorCheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly badges: JurorBadgesService,
  ) {}

  private async getActiveEditionId(): Promise<number> {
    const edition = await this.prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (!edition) {
      throw new NotFoundException('No hay una edición activa configurada');
    }
    return edition.id;
  }

  /** Check-in con el QR de la escarapela (404 si no es válido o es de otra edición). */
  async checkInByToken(token: string, staffId: string): Promise<CheckInResult> {
    const badge = await this.badges.validateToken(token);
    return this.register(
      badge.jurorId,
      badge.editionId,
      staffId,
      CheckInMethod.QR,
      badge.badgeId,
    );
  }

  /** Check-in buscando al jurado por nombre; sirve también si no tiene escarapela. */
  async checkInManually(
    jurorId: string,
    staffId: string,
  ): Promise<CheckInResult> {
    const editionId = await this.getActiveEditionId();
    const juror = await this.prisma.user.findFirst({
      where: eligibleJurorsWhere([jurorId]),
      select: {
        id: true,
        jurorBadges: {
          where: { editionId, isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!juror) {
      throw new NotFoundException('El jurado no existe o no está activo');
    }
    return this.register(
      juror.id,
      editionId,
      staffId,
      CheckInMethod.MANUAL,
      juror.jurorBadges[0]?.id ?? null,
    );
  }

  /** Busca jurados activos por nombre o apellido (cada palabra debe coincidir). */
  async search(query: string): Promise<JurorSearchItem[]> {
    const editionId = await this.getActiveEditionId();
    const words = query.trim().split(/\s+/).filter(Boolean);

    const jurors = await this.prisma.user.findMany({
      where: {
        ...eligibleJurorsWhere(),
        AND: words.map((word) => ({
          OR: [
            { firstName: { contains: word, mode: 'insensitive' } },
            { lastName: { contains: word, mode: 'insensitive' } },
          ],
        })),
      },
      select: {
        ...jurorSelect,
        jurorBadges: {
          where: { editionId, isActive: true },
          select: { id: true },
          take: 1,
        },
        attendances: {
          where: { editionId, isActive: true },
          select: { checkedInAt: true },
          take: 1,
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: SEARCH_LIMIT,
    });

    return jurors.map((juror) => ({
      id: juror.id,
      name: jurorFullName(juror),
      category: jurorCategoryLabel(juror),
      hasBadge: juror.jurorBadges.length > 0,
      checkedInAt: juror.attendances[0]?.checkedInAt ?? null,
    }));
  }

  private async register(
    jurorId: string,
    editionId: number,
    staffId: string,
    method: CheckInMethod,
    badgeId: number | null,
  ): Promise<CheckInResult> {
    const previous = await this.findAttendance(jurorId, editionId);
    if (previous) {
      return this.toResult('ALREADY_CHECKED_IN', previous, jurorId, editionId);
    }

    try {
      const created = await this.prisma.jurorAttendance.create({
        data: { jurorId, editionId, checkedInById: staffId, method, badgeId },
        select: { checkedInAt: true, method: true },
      });
      return this.toResult('CHECKED_IN', created, jurorId, editionId);
    } catch (error) {
      // Dos escaneos simultáneos: el índice único parcial deja pasar solo uno.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.findAttendance(jurorId, editionId);
        if (winner) {
          return this.toResult(
            'ALREADY_CHECKED_IN',
            winner,
            jurorId,
            editionId,
          );
        }
      }
      throw error;
    }
  }

  private findAttendance(jurorId: string, editionId: number) {
    return this.prisma.jurorAttendance.findFirst({
      where: { jurorId, editionId, isActive: true },
      select: { checkedInAt: true, method: true },
    });
  }

  private async toResult(
    status: CheckInStatus,
    attendance: { checkedInAt: Date; method: CheckInMethod },
    jurorId: string,
    editionId: number,
  ): Promise<CheckInResult> {
    const juror = await this.prisma.user.findUniqueOrThrow({
      where: { id: jurorId },
      select: {
        ...jurorSelect,
        teamsToEvaluate: {
          where: { editionId, isActive: true },
          select: { id: true, teamName: true },
          orderBy: { teamName: 'asc' },
        },
      },
    });

    return {
      status,
      checkedInAt: attendance.checkedInAt,
      method: attendance.method,
      juror: {
        id: juror.id,
        name: jurorFullName(juror),
        category: jurorCategoryLabel(juror),
        teams: juror.teamsToEvaluate.map((t) => ({
          id: t.id,
          name: t.teamName,
        })),
      },
    };
  }
}
