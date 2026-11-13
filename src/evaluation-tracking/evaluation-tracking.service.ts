import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EditionStatus } from '@prisma/client';
import {
  MAX_COUNTED_EVALUATIONS,
  countedTotal,
} from '../evaluation/counted-evaluations';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIRMED_VIDEOGAME, GRADABLE_TEAM } from '../teams/team-status';
import {
  HourBucket,
  MINIMUM_CHECK_HOUR,
  TRACKING_HOURS,
  buildHourlyBuckets,
  parseFairDate,
  todayInBogota,
} from './hourly-buckets';
import { findActiveEdition } from '../editions/active-edition';

export interface GroupTracking {
  teamId: number;
  teamCode: string;
  teamName: string;
  videogame: string;
  level: string | null;
  assignedJurors: number;
  presentJurors: number;
  evaluationsReceived: number;
  evaluationsCounted: number;
  byHour: HourBucket[];
  belowMinimumAt11: boolean;
}

export interface EvaluationTrackingResult {
  editionId: number;
  date: string;
  generatedAt: Date;
  hours: number[];
  groups: GroupTracking[];
}

export interface EvaluationTrackingOptions {
  level?: string;
  date?: string;
}

const LEVEL_PATTERN = /^(N\d+)/i;

export function levelFromTeamCode(teamCode: string): string | null {
  const match = LEVEL_PATTERN.exec(teamCode);
  return match ? match[1].toUpperCase() : null;
}

/** De menos a más evaluaciones que cuentan; luego recibidas y código del equipo. */
function byFewestEvaluations(a: GroupTracking, b: GroupTracking): number {
  return (
    a.evaluationsCounted - b.evaluationsCounted ||
    a.evaluationsReceived - b.evaluationsReceived ||
    a.teamCode.localeCompare(b.teamCode)
  );
}

/**
 * HU-21: avance de las evaluaciones de cada grupo de la feria activa, con
 * cortes acumulados por hora. Solo lectura y sin datos personales: lo ven el
 * Administrador y los profesores (P-26). HU-12 reutiliza este servicio.
 */
@Injectable()
export class EvaluationTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveEditionId(): Promise<number> {
    const edition = await findActiveEdition(this.prisma);
    if (!edition) {
      throw new NotFoundException('No hay una edición activa configurada');
    }
    return edition.id;
  }

  async getTracking(
    options: EvaluationTrackingOptions = {},
  ): Promise<EvaluationTrackingResult> {
    const date = options.date ?? todayInBogota();
    if (!parseFairDate(date)) {
      throw new BadRequestException('La fecha no es válida');
    }
    const editionId = await this.getActiveEditionId();

    const teams = await this.prisma.team.findMany({
      where: {
        editionId,
        isActive: true,
        // BG-35 (ARK-158): de aquí salen también las alertas y el panel de HU-12
        videogame: { is: { isActive: true, ...CONFIRMED_VIDEOGAME } },
        ...GRADABLE_TEAM, // HU-39 (ARK-209): el presentador externo no se sigue
      },
      select: {
        id: true,
        teamCode: true,
        teamName: true,
        videogame: { select: { id: true, name: true } },
        assignedJurors: { where: { isActive: true }, select: { id: true } },
      },
    });

    const visibleTeams = options.level
      ? teams.filter((t) => levelFromTeamCode(t.teamCode) === options.level)
      : teams;

    const videogameIds = visibleTeams
      .map((t) => t.videogame?.id)
      .filter((id): id is number => typeof id === 'number');
    const assignedIds = [
      ...new Set(
        visibleTeams.flatMap((t) => t.assignedJurors.map((j) => j.id)),
      ),
    ];

    const [evaluations, attendance] = await Promise.all([
      videogameIds.length
        ? this.prisma.evaluation.findMany({
            where: {
              editionId,
              isActive: true,
              videogameId: { in: videogameIds },
            },
            select: { videogameId: true, date: true },
          })
        : Promise.resolve([]),
      assignedIds.length
        ? this.prisma.jurorAttendance.findMany({
            where: { editionId, isActive: true, jurorId: { in: assignedIds } },
            select: { jurorId: true },
          })
        : Promise.resolve([]),
    ]);

    const datesByGame = new Map<number, Date[]>();
    for (const evaluation of evaluations) {
      const dates = datesByGame.get(evaluation.videogameId) ?? [];
      dates.push(evaluation.date);
      datesByGame.set(evaluation.videogameId, dates);
    }
    const present = new Set(attendance.map((a) => a.jurorId));

    const groups = visibleTeams.map((team): GroupTracking => {
      const dates =
        (team.videogame && datesByGame.get(team.videogame.id)) || [];
      const byHour = buildHourlyBuckets(dates, date);
      const at11 = byHour.find((b) => b.hour === MINIMUM_CHECK_HOUR);
      return {
        teamId: team.id,
        teamCode: team.teamCode,
        teamName: team.teamName,
        videogame: team.videogame?.name ?? '',
        level: levelFromTeamCode(team.teamCode),
        assignedJurors: team.assignedJurors.length,
        presentJurors: team.assignedJurors.filter((j) => present.has(j.id))
          .length,
        evaluationsReceived: dates.length,
        evaluationsCounted: countedTotal(dates.length),
        byHour,
        belowMinimumAt11: (at11?.counted ?? 0) < MAX_COUNTED_EVALUATIONS,
      };
    });

    return {
      editionId,
      date,
      generatedAt: new Date(),
      hours: [...TRACKING_HOURS],
      groups: groups.sort(byFewestEvaluations),
    };
  }
}
