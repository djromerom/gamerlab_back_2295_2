import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  JurorCategory,
  JurorEditionStatus,
  JurorType,
  ManualJurorAssignmentAction,
  Prisma,
} from '@prisma/client';

import {
  ActiveEdition,
  requireActiveEdition,
} from 'src/editions/active-edition';
import { MAX_COUNTED_EVALUATIONS } from 'src/evaluation/counted-evaluations';
import {
  fairPhase,
  isControlReached,
} from 'src/jurors/absence-alert/fair-schedule';
import { FairScheduleService } from 'src/jurors/absence-alert/fair-schedule.service';
import {
  JUROR_ROLE_NAME,
  PROFESSOR_ROLE_NAME,
} from 'src/jurors/juror-badges/juror-label';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { JurorAssignmentAuditService } from 'src/jurors/juror/assignment-audit/juror-assignment-audit.service';
import {
  extractTeamLevel,
  findTeamNotConfirmedBlocker,
  findTeamNotGradableBlocker,
} from 'src/jurors/juror/assignment-validation/assignment-rules';
import { AssignmentWarning } from 'src/jurors/juror/assignment-validation/assignment-rules.types';
import { AssignmentValidationService } from 'src/jurors/juror/assignment-validation/assignment-validation.service';
import { teamLevelLabel } from 'src/jurors/juror/assignment-validation/team-level';
import { SubstituteNoticesService } from 'src/jurors/substitute-notices/substitute-notices.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AssignmentPushNotifier } from 'src/push-notifications/assignment-push-notifier.service';
import { ASSIGNABLE_TEAM } from 'src/teams/team-status';
import { AssignWalkInTeamsDto } from './dto/assign-walk-in-teams.dto';
import { DEFAULT_MAX_TEAMS } from './dto/team-suggestion-query.dto';
import { planGroupShortage } from './group-shortage.logic';
import {
  NO_SHORTAGE,
  NOT_A_JUNIOR_SUBSTITUTE,
  TEAM_NOT_FOUND,
  TeamSuggestion,
  TeamSummary,
  WALK_IN_AUDIT_NOTE,
  WalkInAssignmentResult,
} from './types/walk-in-assignment.types';

const EVALUATOR_ROLES = {
  name: { in: [JUROR_ROLE_NAME, PROFESSOR_ROLE_NAME] },
};

type Candidate = { id: string; firstName: string; lastName: string };

const fullName = (person: Candidate) =>
  `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();

const count = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

/**
 * HU-24 (ARK-217): botón «Asignar grupos automáticamente» para un suplente junior.
 *
 * - `suggest` no guarda nada: propone hasta `maxTeams` grupos del nivel con más jurados faltantes
 *   (`group-shortage.logic.ts`). Antes de la hora de control (11:00, HU-12) cuentan los jurados
 *   asignados; desde ella, los presentes: con llegada registrada o que ya evaluaron ese grupo.
 * - `assign` guarda los grupos que el administrador confirmó o editó. **Solo suma** (`connect`):
 *   nadie pierde grupos. Reglas de HU-08 sobre todos los grupos nuevos (bloqueos y advertencias
 *   con `confirmWarnings`). Una transacción con los pares, una fila de bitácora por grupo y el
 *   aviso de HU-22; la notificación push y el correo salen después de confirmar.
 * - Aplica a cualquier Suplente Junior confirmado de la edición activa, no solo a los dados de
 *   alta el día de la feria (decisión del 15-nov).
 */
@Injectable()
export class WalkInAssignmentService {
  private readonly logger = new Logger(WalkInAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: FairScheduleService,
    private readonly assignmentValidation: AssignmentValidationService,
    private readonly audit: JurorAssignmentAuditService,
    private readonly substituteNotices: SubstituteNoticesService,
    private readonly pushNotifier: AssignmentPushNotifier,
  ) {}

  async suggest(
    jurorId: string,
    maxTeams: number = DEFAULT_MAX_TEAMS,
    now: Date = new Date(),
  ): Promise<TeamSuggestion> {
    const edition = await requireActiveEdition(this.prisma);
    await this.requireCandidate(jurorId, edition);

    const schedule = await this.schedules.findForEdition(edition.id);
    const phase = fairPhase(schedule, now);
    const basis = isControlReached(phase) ? 'PRESENT' : 'ASSIGNED';

    // Grupos que se le pueden asignar: activos, confirmados, calificables y que todavía no tiene.
    const teams = await this.prisma.team.findMany({
      where: {
        isActive: true,
        editionId: edition.id,
        ...ASSIGNABLE_TEAM,
        NOT: { assignedJurors: { some: { id: jurorId } } },
      },
      select: {
        id: true,
        teamCode: true,
        teamName: true,
        videogame: { select: { id: true, name: true } },
        // Mismo criterio que el panel de HU-12: solo cuentan los jurados de la edición.
        assignedJurors: {
          where: jurorsOfEdition(edition.id),
          select: { id: true },
        },
      },
    });

    const present =
      basis === 'PRESENT'
        ? await this.loadPresence(
            edition.id,
            teams.flatMap((team) =>
              team.videogame ? [team.videogame.id] : [],
            ),
          )
        : null;

    const plan = planGroupShortage(
      teams.map((team) => ({
        id: team.id,
        teamCode: team.teamCode,
        teamName: team.teamName,
        videogame: team.videogame?.name ?? null,
        level: extractTeamLevel(team.teamCode),
        countedJurors: present
          ? team.assignedJurors.filter((juror) =>
              present.isPresent(juror.id, team.videogame?.id ?? null),
            ).length
          : team.assignedJurors.length,
      })),
      { maxTeams, required: MAX_COUNTED_EVALUATIONS },
    );

    return {
      edition: { id: edition.id, title: edition.title },
      phase,
      basis,
      maxTeams,
      level: plan.level,
      levelLabel: plan.level === null ? null : teamLevelLabel(plan.level),
      teams: plan.teams,
      otherTeamsOfLevel: plan.otherTeamsOfLevel,
      levels: plan.levels,
      reason: plan.level === null ? NO_SHORTAGE : null,
    };
  }

  async assign(
    jurorId: string,
    dto: AssignWalkInTeamsDto,
    actorUserId: string,
  ): Promise<WalkInAssignmentResult> {
    try {
      const edition = await requireActiveEdition(this.prisma);
      const juror = await this.requireCandidate(jurorId, edition);
      const teams = await this.loadTeams(dto.teamIds);

      const hasJuror = (team: (typeof teams)[number]) =>
        team.assignedJurors.some((assigned) => assigned.id === jurorId);
      const added = teams.filter((team) => !hasJuror(team));
      const skipped = teams.filter(hasJuror);

      let accepted: AssignmentWarning[] = [];
      if (added.length > 0) {
        accepted = await this.validate(juror, added, edition, dto);
        const noticeId = await this.prisma.$transaction(
          (tx) => this.save(tx, jurorId, added, actorUserId, accepted, edition),
          { maxWait: 10_000, timeout: 60_000 },
        );
        this.pushNotifier.notifyAssignmentChanged([jurorId]);
        this.substituteNotices.sendEmailAfterCommit([noticeId]);
      }

      const summary = (team: (typeof teams)[number]): TeamSummary => ({
        id: team.id,
        codigo: team.teamCode,
        nombre: team.teamName,
      });
      return {
        message:
          added.length > 0
            ? `Se ${added.length === 1 ? 'asignó' : 'asignaron'} ${count(added.length, 'grupo', 'grupos')} a ${fullName(juror)}. Nadie perdió grupos.`
            : `No había grupos nuevos: ${fullName(juror)} ya tenía todos los grupos elegidos.`,
        edicion: { id: edition.id, title: edition.title },
        jurado: { id: juror.id, nombre: fullName(juror) },
        equiposAgregados: added.map(summary),
        equiposYaAsignados: skipped.map(summary),
        advertenciasAceptadas: accepted,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('HU-24: error al asignar grupos al suplente:', error);
      throw new InternalServerErrorException(
        'No se pudieron asignar los grupos. Se revirtió todo y no cambió ninguna asignación.',
      );
    }
  }

  /** Bloqueos de equipo (sin confirmar, no calificable) y reglas de HU-08. Devuelve las aceptadas. */
  private async validate(
    juror: Candidate,
    added: Awaited<ReturnType<WalkInAssignmentService['loadTeams']>>,
    edition: ActiveEdition,
    dto: AssignWalkInTeamsDto,
  ): Promise<AssignmentWarning[]> {
    const teamBlockers = added.flatMap((team) => {
      const blocker =
        findTeamNotConfirmedBlocker(team) ?? findTeamNotGradableBlocker(team);
      return blocker ? [blocker] : [];
    });
    if (teamBlockers.length > 0) {
      this.assignmentValidation.enforce({
        blockers: teamBlockers,
        warnings: [],
      });
    }

    const result = await this.assignmentValidation.validate({
      activeEdition: { id: edition.id, title: edition.title },
      teams: added.map((team) => ({
        id: team.id,
        teamCode: team.teamCode,
        editionId: team.editionId,
        editionTitle: team.edition.title,
        jurorIds: team.assignedJurors.map((assigned) => assigned.id),
      })),
      evaluators: [
        {
          id: juror.id,
          name: fullName(juror),
          kind: 'JUROR',
          jurorCategory: JurorCategory.JUNIOR,
          participatesInActiveEdition: true,
        },
      ],
      changes: added.map((team) => ({
        type: 'ADD' as const,
        jurorId: juror.id,
        teamId: team.id,
      })),
    });
    return this.assignmentValidation.enforce(
      result,
      dto.confirmWarnings ?? false,
    );
  }

  /** Pares, bitácora y aviso de HU-22 en la misma transacción. Devuelve el id del aviso. */
  private async save(
    tx: Prisma.TransactionClient,
    jurorId: string,
    added: Array<{ id: number }>,
    actorUserId: string,
    accepted: AssignmentWarning[],
    edition: ActiveEdition,
  ): Promise<number | null> {
    for (const team of added) {
      // `connect` agrega sin quitar a nadie: los jurados del grupo conservan su lugar.
      await tx.team.update({
        where: { id: team.id },
        data: { assignedJurors: { connect: { id: jurorId } } },
      });
      await this.audit.create(
        {
          action: ManualJurorAssignmentAction.ASSIGN,
          actorUserId,
          teamId: team.id,
          jurorId,
          newJurorId: jurorId,
          notes: AssignmentValidationService.auditNote(
            WALK_IN_AUDIT_NOTE,
            accepted,
          ),
        },
        tx,
      );
    }
    return this.substituteNotices.recordAssignment(tx, {
      jurorId,
      teamIds: added.map((team) => team.id),
      editionId: edition.id,
    });
  }

  /** Suplente Junior confirmado en la edición activa, con cuenta de Jurado activa; si no, 404. */
  private async requireCandidate(
    jurorId: string,
    edition: ActiveEdition,
  ): Promise<Candidate> {
    const juror = await this.prisma.user.findFirst({
      where: {
        id: jurorId,
        isActive: true,
        role: { name: JUROR_ROLE_NAME },
        jurorCategory: JurorCategory.JUNIOR,
        jurorEditions: {
          some: {
            editionId: edition.id,
            type: JurorType.BACKUP,
            status: JurorEditionStatus.CONFIRMED,
          },
        },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!juror) {
      throw new NotFoundException({
        statusCode: 404,
        code: NOT_A_JUNIOR_SUBSTITUTE,
        message: `El jurado no es Suplente Junior confirmado de «${edition.title}». Revisa su tipo y estado en Jurados de la edición.`,
      });
    }
    return juror;
  }

  /** Grupos elegidos, en el orden recibido. 404 si alguno no existe o está inactivo. */
  private async loadTeams(teamIds: number[]) {
    const found = await this.prisma.team.findMany({
      where: { id: { in: teamIds }, isActive: true },
      select: {
        id: true,
        teamCode: true,
        teamName: true,
        editionId: true,
        notGradable: true,
        edition: { select: { title: true } },
        videogame: {
          select: { videogameStatus: { select: { status: true } } },
        },
        // Mismo criterio de «jurados del grupo» que la asignación manual y la de suplentes.
        assignedJurors: {
          where: { isActive: true, role: EVALUATOR_ROLES },
          select: { id: true },
        },
      },
    });
    const missing = teamIds.filter((id) => !found.some((t) => t.id === id));
    if (missing.length > 0) {
      throw new NotFoundException({
        statusCode: 404,
        code: TEAM_NOT_FOUND,
        message: `${missing.length === 1 ? 'Un grupo elegido no existe o está inactivo' : `${missing.length} grupos elegidos no existen o están inactivos`}. No se asignó nada.`,
        teamIds: missing,
      });
    }
    return teamIds.map((id) => found.find((team) => team.id === id)!);
  }

  /** Desde la hora de control: presente = llegada registrada o ya evaluó ese grupo. */
  private async loadPresence(editionId: number, videogameIds: number[]) {
    const [attendances, evaluations] = await Promise.all([
      this.prisma.jurorAttendance.findMany({
        where: { editionId, isActive: true },
        select: { jurorId: true },
      }),
      this.prisma.evaluation.findMany({
        where: { editionId, isActive: true, videogameId: { in: videogameIds } },
        select: { videogameId: true, jurorId: true },
      }),
    ]);
    const arrived = new Set(attendances.map((a) => a.jurorId));
    const evaluated = new Set(
      evaluations.map((e) => `${e.videogameId}:${e.jurorId}`),
    );
    return {
      isPresent: (jurorId: string, videogameId: number | null) =>
        arrived.has(jurorId) || evaluated.has(`${videogameId}:${jurorId}`),
    };
  }
}
