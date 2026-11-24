import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_EDITION_WHERE,
  NO_ACTIVE_EDITION,
} from '../editions/active-edition';
import { PrismaService } from '../prisma/prisma.service';
import { EVENT_CONFIGURATION_NOT_FOUND } from '../settings/active-edition-config';
import { activeEditionTeamOfLeaderOrMember } from '../teams/active-edition-team';
import { REJECTED_VIDEOGAME_STATUS } from '../teams/team-status';
import {
  checkTeamGrade,
  FINAL_GRADE_RELEASE_TOO_EARLY,
  FINAL_GRADE_TIME_ZONE,
  FinalScoreRow,
  formatFairDay,
  IncompleteReason,
  resolveReleaseMoment,
  StudentGradeStatus,
  UngradedReason,
  studentGrade,
} from './final-grade.logic';

export interface IncompleteTeam {
  teamId: number;
  teamCode: string | null;
  teamName: string | null;
  videogameName: string | null;
  /** Nota del ranking hasta ahora (solo la ve el administrador). */
  finalScore: number | null;
  juniorEvaluations: number;
  seniorEvaluations: number;
  /** true: el estudiante verá «Nota en proceso». false: solo es un aviso (menos de 3). */
  inProcess: boolean;
  reasons: IncompleteReason[];
}

export interface FinalGradeReleaseStatus {
  editionId: number;
  editionTitle: string;
  showFinalGrade: boolean;
  releasedAt: string | null;
  /** Día de la feria (`YYYY-MM-DD`) y hora de cierre (`HH:mm`), en hora de Colombia. */
  fairDate: string;
  releaseTime: string;
  timeZone: string;
  /** `true` si la hora sale del cronograma de la feria (HU-12); `false`, valor por defecto. */
  scheduleConfigured: boolean;
  releaseAllowedFrom: string;
  canReleaseNow: boolean;
  summary: {
    totalTeams: number;
    withFinalGrade: number;
    inProcess: number;
    lessThanMinEvaluations: number;
  };
  incompleteTeams: IncompleteTeam[];
}

export interface StudentFinalGrade {
  editionId: number;
  team: { id: number; teamName: string | null; teamCode: string | null };
  released: boolean;
  status: StudentGradeStatus;
  finalGrade: number | null;
}

/**
 * HU-20 (ARK-80): liberar la nota final a los estudiantes y consultarla.
 * Siempre sobre la edición activa: las ediciones pasadas no cambian.
 */
@Injectable()
export class FinalGradeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estado de la liberación y equipos con datos incompletos (panel del administrador). */
  async getReleaseStatus(
    now: Date = new Date(),
  ): Promise<FinalGradeReleaseStatus> {
    const edition = await this.activeEditionWithConfig();
    const config = edition.eventConfiguration!;
    const rows = await this.activeTeamRows(edition.id);
    const release = resolveReleaseMoment(
      edition.startsAt,
      edition.fairSchedule,
    );
    const allowedFrom = release.at;

    const incompleteTeams: IncompleteTeam[] = [];
    let inProcess = 0;
    let lessThanMin = 0;
    for (const row of rows) {
      const check = checkTeamGrade(row);
      if (check.inProcess) inProcess++;
      if (check.reasons.includes('LESS_THAN_MIN_EVALUATIONS')) lessThanMin++;
      if (check.reasons.length === 0 && !check.inProcess) continue;
      incompleteTeams.push({
        teamId: row.teamId,
        teamCode: row.teamCode,
        teamName: row.teamName,
        videogameName: row.videogameName,
        finalScore: row.finalScore,
        juniorEvaluations: row.juniorEvaluations,
        seniorEvaluations: row.seniorEvaluations,
        inProcess: check.inProcess,
        reasons: check.reasons,
      });
    }
    // Primero los que quedarían «en proceso», luego por código.
    incompleteTeams.sort(
      (a, b) =>
        Number(b.inProcess) - Number(a.inProcess) ||
        (a.teamCode ?? '').localeCompare(b.teamCode ?? ''),
    );

    return {
      editionId: edition.id,
      editionTitle: edition.title,
      showFinalGrade: config.showFinalGrade,
      releasedAt: config.finalGradeReleasedAt?.toISOString() ?? null,
      fairDate: release.fairDate,
      releaseTime: release.releaseTime,
      timeZone: FINAL_GRADE_TIME_ZONE,
      scheduleConfigured: release.fromSchedule,
      releaseAllowedFrom: allowedFrom.toISOString(),
      canReleaseNow: now.getTime() >= allowedFrom.getTime(),
      summary: {
        totalTeams: rows.length,
        withFinalGrade: rows.length - inProcess,
        inProcess,
        lessThanMinEvaluations: lessThanMin,
      },
      incompleteTeams,
    };
  }

  /**
   * Libera (`show=true`) u oculta (`show=false`) la nota final. Liberar antes de la hora de
   * cierre del día de la feria responde 400 con la hora; ocultar se puede siempre y también oculta
   * el ranking público (BG-67: el ranking no se ve sin la nota final liberada).
   */
  async setRelease(
    show: boolean,
    now: Date = new Date(),
  ): Promise<FinalGradeReleaseStatus> {
    const edition = await this.activeEditionWithConfig();
    const config = edition.eventConfiguration!;

    if (show) {
      const release = resolveReleaseMoment(
        edition.startsAt,
        edition.fairSchedule,
      );
      const allowedFrom = release.at;
      if (now.getTime() < allowedFrom.getTime()) {
        throw new BadRequestException({
          statusCode: 400,
          code: FINAL_GRADE_RELEASE_TOO_EARLY,
          releaseAllowedFrom: allowedFrom.toISOString(),
          message: `La nota final se puede liberar a partir de las ${release.releaseTime} del ${formatFairDay(release.fairDate)} (hora de Colombia).`,
        });
      }
    }

    if (config.showFinalGrade !== show) {
      await this.prisma.eventConfiguration.update({
        where: { id: config.id },
        // BG-67 (ARK-268): ocultar la nota final también oculta el ranking público
        data: show
          ? { showFinalGrade: true, finalGradeReleasedAt: now }
          : { showFinalGrade: false, finalGradeReleasedAt: null, showRanking: false },
      });
    }
    return this.getReleaseStatus(now);
  }

  /**
   * Nota final del equipo del estudiante en la edición activa, sin desglose. Con `email`, también
   * la del equipo en el que es integrante activo sin ser el líder (solo lectura).
   */
  async getStudentFinalGrade(userId: string, email?: string | null): Promise<StudentFinalGrade> {
    const team = await this.prisma.team.findFirst({
      where: activeEditionTeamOfLeaderOrMember(userId, email),
      orderBy: { editionId: 'desc' },
      select: {
        id: true,
        teamName: true,
        teamCode: true,
        editionId: true,
        notGradable: true,
        videogame: { select: { videogameStatus: { select: { status: true } } } },
        edition: {
          select: { eventConfiguration: { select: { showFinalGrade: true } } },
        },
      },
    });
    if (!team) {
      throw new NotFoundException('No tienes un equipo en la edición activa.');
    }
    const released = team.edition.eventConfiguration?.showFinalGrade === true;
    const ungraded: UngradedReason = team.notGradable
      ? 'NOT_GRADABLE'
      : team.videogame?.videogameStatus.status === REJECTED_VIDEOGAME_STATUS
        ? 'REJECTED'
        : null;
    const row = released && !ungraded
      ? await this.prisma.teamFinalScore.findFirst({
          where: { teamId: team.id, editionId: team.editionId },
        })
      : null;
    const grade = studentGrade(released, row, ungraded);
    return {
      editionId: team.editionId,
      team: { id: team.id, teamName: team.teamName, teamCode: team.teamCode },
      released,
      status: grade.status,
      finalGrade: grade.finalGrade,
    };
  }

  private async activeEditionWithConfig() {
    const edition = await this.prisma.edition.findFirst({
      where: ACTIVE_EDITION_WHERE,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        title: true,
        startsAt: true,
        fairSchedule: { select: { fairDate: true, closeTime: true } },
        eventConfiguration: {
          select: {
            id: true,
            showFinalGrade: true,
            finalGradeReleasedAt: true,
          },
        },
      },
    });
    if (!edition) {
      throw new NotFoundException({
        statusCode: 404,
        code: NO_ACTIVE_EDITION,
        message: 'No hay una edición activa.',
      });
    }
    if (!edition.eventConfiguration) {
      throw new NotFoundException({
        statusCode: 404,
        code: EVENT_CONFIGURATION_NOT_FOUND,
        message:
          'La edición activa no tiene configuración del evento. Activa la edición de nuevo desde Ediciones para crearla.',
      });
    }
    return edition;
  }

  /** Filas de la vista para los equipos activos de la edición (los que tienen videojuego). */
  private async activeTeamRows(editionId: number): Promise<FinalScoreRow[]> {
    const [rows, activeTeams] = await Promise.all([
      this.prisma.teamFinalScore.findMany({ where: { editionId } }),
      this.prisma.team.findMany({
        where: { editionId, isActive: true },
        select: { id: true },
      }),
    ]);
    const active = new Set(activeTeams.map((t) => t.id));
    return rows.filter((r) => active.has(r.teamId));
  }
}
