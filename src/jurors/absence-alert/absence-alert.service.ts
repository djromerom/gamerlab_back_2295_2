import { Injectable } from '@nestjs/common';
import { requireActiveEdition } from 'src/editions/active-edition';
import { MAX_COUNTED_EVALUATIONS } from 'src/evaluation/counted-evaluations';
import { JUROR_EVALUATION_FILTER } from 'src/evaluation/juror-evaluation';
import { EvaluationTrackingService } from 'src/evaluation-tracking/evaluation-tracking.service';
import { compareRows } from 'src/jurors/juror-attendance/attendance-page';
import { JurorAttendanceService } from 'src/jurors/juror-attendance/juror-attendance.service';
import { toEditionSummary } from 'src/jurors/juror-edition/edition-resolver';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  AbsenceAlert,
  AbsencePanel,
  AlertJuror,
  AlertTotals,
  JurorAttendanceState,
  PanelGroup,
} from './absence-alert.types';
import { AbsencePanelQueryDto } from './dto/absence-panel-query.dto';
import {
  FairPhase,
  fairPhase,
  isAlertReached,
  isControlReached,
} from './fair-schedule';
import { FairScheduleService } from './fair-schedule.service';

function totalsOf(jurors: AlertJuror[]): AlertTotals {
  const present = jurors.filter((juror) => juror.state === 'PRESENT').length;
  return { present, missing: jurors.length - present, total: jurors.length };
}

/**
 * HU-12: alerta temprana de inasistencia y panel de asistencia. Solo lectura y calculado en cada
 * consulta: un check-in saca al jurado de la alerta en la siguiente actualización del panel.
 * Quién es jurado lo decide `jurorsOfEdition`, a través de `JurorAttendanceService`.
 */
@Injectable()
export class AbsenceAlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: JurorAttendanceService,
    private readonly tracking: EvaluationTrackingService,
    private readonly schedules: FairScheduleService,
  ) {}

  /**
   * Jurados de la edición sin check-in, por apellido. No depende de la hora: antes de la hora de
   * control vienen como `NO_CHECK_IN` y desde ella como `ABSENT`. Para otros módulos (HU-13, HU-14).
   */
  async listAbsentJurors(
    editionId: number,
    now: Date = new Date(),
  ): Promise<AlertJuror[]> {
    const schedule = await this.schedules.findForEdition(editionId);
    const jurors = await this.loadJurors(editionId, fairPhase(schedule, now));
    return jurors.filter((juror) => juror.state !== 'PRESENT');
  }

  async getAlert(now: Date = new Date()): Promise<AbsenceAlert> {
    const edition = await requireActiveEdition(this.prisma);
    const schedule = await this.schedules.findForEdition(edition.id);
    const phase = fairPhase(schedule, now);
    const jurors = await this.loadJurors(edition.id, phase);
    const totals = totalsOf(jurors);
    const reached = isAlertReached(phase);

    const groups = reached
      ? (await this.loadGroups(edition.id, jurors))
          .filter((group) => group.missingEvaluations > 0)
          .sort(
            (a, b) =>
              b.missingEvaluations - a.missingEvaluations ||
              a.teamCode.localeCompare(b.teamCode),
          )
          .map(({ jurors: _jurors, ...group }) => group)
      : [];

    return {
      edition: toEditionSummary(edition),
      schedule,
      phase,
      alertActive: reached && (totals.missing > 0 || groups.length > 0),
      generatedAt: now,
      totals,
      missingJurors: reached
        ? jurors.filter((juror) => juror.state !== 'PRESENT')
        : [],
      groups,
    };
  }

  /** El panel de seguimiento por grupo con la asistencia de cada jurado (filtrable). */
  async getPanel(
    query: AbsencePanelQueryDto,
    now: Date = new Date(),
  ): Promise<AbsencePanel> {
    const edition = await requireActiveEdition(this.prisma);
    const schedule = await this.schedules.findForEdition(edition.id);
    const phase = fairPhase(schedule, now);
    const jurors = await this.loadJurors(edition.id, phase);
    const groups = await this.loadGroups(edition.id, jurors);

    return {
      edition: toEditionSummary(edition),
      phase,
      generatedAt: now,
      totals: totalsOf(jurors),
      data: query.attendance
        ? groups
            .map((group) => ({
              ...group,
              jurors: group.jurors.filter(
                (juror) => juror.state === query.attendance,
              ),
            }))
            .filter((group) => group.jurors.length > 0)
        : groups,
    };
  }

  /** Los jurados de la edición con su estado: primero los que faltan, por apellido. */
  private async loadJurors(
    editionId: number,
    phase: FairPhase,
  ): Promise<AlertJuror[]> {
    const [rows, enrollments] = await Promise.all([
      this.attendance.rowsOfEdition(editionId),
      this.prisma.jurorEdition.findMany({
        where: { editionId },
        select: { jurorId: true, type: true },
      }),
    ]);
    const typeOf = new Map(enrollments.map((e) => [e.jurorId, e.type]));
    const missingState: JurorAttendanceState = isControlReached(phase)
      ? 'ABSENT'
      : 'NO_CHECK_IN';

    return [...rows].sort(compareRows).map(({ item }) => ({
      jurorId: item.jurorId,
      name: item.name,
      category: item.category,
      isProfessor: item.isProfessor,
      type: typeOf.get(item.jurorId) ?? null,
      state: item.checkedInAt ? 'PRESENT' : missingState,
      checkedInAt: item.checkedInAt,
    }));
  }

  /**
   * Grupos de la feria activa (avance de HU-21) con sus jurados. Un asignado que ya no es jurado
   * de la edición no aparece ni cuenta. Los cálculos de evaluaciones son los de HU-21.
   */
  private async loadGroups(
    editionId: number,
    jurors: AlertJuror[],
  ): Promise<PanelGroup[]> {
    const [{ groups }, teams, evaluations] = await Promise.all([
      this.tracking.getTracking(),
      this.prisma.team.findMany({
        where: { editionId, isActive: true },
        select: {
          id: true,
          videogame: { select: { id: true } },
          assignedJurors: { where: { isActive: true }, select: { id: true } },
        },
      }),
      this.prisma.evaluation.findMany({
        // BG-73 (ARK-284): «ya evaluó» es haber enviado una evaluación de jurado; la nota del
        // profesor a sus NRC (sin detalles) no lo cuenta.
        where: { editionId, ...JUROR_EVALUATION_FILTER },
        select: { videogameId: true, jurorId: true },
      }),
    ]);

    const teamById = new Map(teams.map((team) => [team.id, team]));
    const jurorById = new Map(jurors.map((juror) => [juror.jurorId, juror]));
    const evaluated = new Set(
      evaluations.map((e) => `${e.videogameId}:${e.jurorId}`),
    );

    return groups.map((group): PanelGroup => {
      const team = teamById.get(group.teamId);
      const groupJurors = (team?.assignedJurors ?? []).flatMap(({ id }) => {
        const juror = jurorById.get(id);
        if (!juror) return [];
        return [
          {
            ...juror,
            hasEvaluated: evaluated.has(`${team?.videogame?.id}:${id}`),
          },
        ];
      });
      return {
        teamId: group.teamId,
        teamCode: group.teamCode,
        teamName: group.teamName,
        videogame: group.videogame,
        level: group.level,
        assignedJurors: groupJurors.length,
        presentJurors: groupJurors.filter((j) => j.state === 'PRESENT').length,
        evaluationsCounted: group.evaluationsCounted,
        missingEvaluations: MAX_COUNTED_EVALUATIONS - group.evaluationsCounted,
        jurors: groupJurors,
      };
    });
  }
}
