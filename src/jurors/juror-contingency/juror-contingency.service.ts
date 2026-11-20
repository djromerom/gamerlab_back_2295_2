import { Injectable, NotFoundException } from '@nestjs/common';
import { JurorCategory, JurorEditionStatus, JurorType } from '@prisma/client';

import {
  ActiveEdition,
  requireActiveEdition,
} from 'src/editions/active-edition';
import {
  fairPhase,
  isControlReached,
} from 'src/jurors/absence-alert/fair-schedule';
import { FairScheduleService } from 'src/jurors/absence-alert/fair-schedule.service';
import { loadNotComing } from 'src/jurors/absent-juror-responses/not-coming';
import {
  JUROR_ROLE_NAME,
  PROFESSOR_ROLE_NAME,
} from 'src/jurors/juror-badges/juror-label';
import { jurorsOfEdition } from 'src/jurors/juror-edition/jurors-of-edition';
import { JurorPresenceService } from 'src/jurors/juror-presence/juror-presence.service';
import { extractTeamLevel } from 'src/jurors/juror/assignment-validation/assignment-rules';
import { AssignmentValidationService } from 'src/jurors/juror/assignment-validation/assignment-validation.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { EVENT_CONFIGURATION_NOT_FOUND } from 'src/settings/active-edition-config';
import { ASSIGNABLE_TEAM } from 'src/teams/team-status';
import {
  ContingencyTeamInput,
  GroupSuggestion,
  SubstituteInput,
  groupsAtRisk,
  suggestSubstitutes,
} from './contingency.logic';
import { UpdateContingencySettingsDto } from './dto/update-contingency-settings.dto';
import {
  ContingencyContext,
  DEFAULT_MIN_EVALUATIONS,
  GroupSuggestionWithWarnings,
  GroupsAtRiskResponse,
  SuggestionsResponse,
} from './types/juror-contingency.types';

const fullName = (u: { firstName: string | null; lastName: string | null }) =>
  `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();

/** Un profesor es Senior (P-07) aunque no tenga la categoría guardada. */
const categoryOf = (u: {
  jurorCategory: JurorCategory | null;
  role: { name: string };
}) =>
  u.jurorCategory ??
  (u.role.name === PROFESSOR_ROLE_NAME ? JurorCategory.SENIOR : null);

/**
 * HU-14 (ARK-213): grupos en riesgo y sugerencia de suplentes. Solo lectura; se calcula en cada
 * consulta con la hora actual (como la alerta de HU-12). Las reglas están en `contingency.logic.ts`.
 *
 * Los jurados de un grupo y los suplentes salen de los jurados confirmados de la edición (HU-25).
 * Funciona a cualquier hora: antes de la hora de control cuentan los asignados y la respuesta
 * dice en qué fase está (el administrador puede abrir el caso antes, CU-14).
 */
@Injectable()
export class JurorContingencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: FairScheduleService,
    private readonly presence: JurorPresenceService,
    private readonly assignmentValidation: AssignmentValidationService,
  ) {}

  async getGroupsAtRisk(now: Date = new Date()): Promise<GroupsAtRiskResponse> {
    const { context, teams } = await this.loadSituation(now);
    return {
      ...context,
      grupos: groupsAtRisk(teams, {
        basis: context.base,
        minimum: context.minimoEvaluaciones,
      }),
    };
  }

  async getSuggestions(now: Date = new Date()): Promise<SuggestionsResponse> {
    const { context, teams, edition } = await this.loadSituation(now);
    const [substitutes, rejectedPairs] = await Promise.all([
      this.loadSubstitutes(edition.id),
      this.prisma.substituteSuggestionRejection.findMany({
        where: { editionId: edition.id, substituteId: { not: null } },
        select: { teamId: true, substituteId: true },
      }),
    ]);

    const suggestions = suggestSubstitutes(
      groupsAtRisk(teams, {
        basis: context.base,
        minimum: context.minimoEvaluaciones,
      }),
      substitutes,
      {
        rejectedPairs: rejectedPairs.map((r) => ({
          teamId: r.teamId,
          substituteId: r.substituteId!,
        })),
      },
    );
    const grupos = await this.withWarnings(
      suggestions,
      substitutes,
      teams,
      edition,
      context.minimoEvaluaciones,
    );

    const sum = (pick: (g: GroupSuggestion) => number) =>
      grupos.reduce((total, group) => total + pick(group), 0);
    return {
      ...context,
      totales: {
        gruposEnRiesgo: grupos.length,
        faltantes: sum((g) => g.faltantes),
        sugeridos: sum((g) => g.sugeridos.length),
        sinCubrir: sum((g) => g.sinCubrir),
      },
      suplentesDisponibles: substitutes.length,
      grupos,
    };
  }

  /** Mínimo de evaluaciones de la edición activa y el cronograma (las horas, HU-12). */
  async getSettings() {
    const edition = await requireActiveEdition(this.prisma);
    const [minimum, schedule] = await Promise.all([
      this.minimumOf(edition.id),
      this.schedules.findForEdition(edition.id),
    ]);
    return {
      edicion: { id: edition.id, title: edition.title },
      minEvaluationsPerTeam: minimum,
      cronograma: schedule,
    };
  }

  async updateSettings(dto: UpdateContingencySettingsDto) {
    const edition = await requireActiveEdition(this.prisma);
    const config = await this.prisma.eventConfiguration.findUnique({
      where: { editionId: edition.id },
      select: { id: true },
    });
    if (!config) {
      throw new NotFoundException({
        statusCode: 404,
        code: EVENT_CONFIGURATION_NOT_FOUND,
        message:
          'La edición activa no tiene configuración del evento. Activa la edición de nuevo desde Ediciones para crearla.',
      });
    }
    await this.prisma.eventConfiguration.update({
      where: { id: config.id },
      data: { minEvaluationsPerTeam: dto.minEvaluationsPerTeam },
    });
    return this.getSettings();
  }

  /** Mínimo configurado de la edición; 3 si no tiene configuración. */
  async minimumOf(editionId: number): Promise<number> {
    const config = await this.prisma.eventConfiguration.findUnique({
      where: { editionId },
      select: { minEvaluationsPerTeam: true },
    });
    return config?.minEvaluationsPerTeam ?? DEFAULT_MIN_EVALUATIONS;
  }

  /** Edición, fase, mínimo y los grupos asignables con la situación de cada jurado. */
  private async loadSituation(now: Date) {
    const edition = await requireActiveEdition(this.prisma);
    const [schedule, minimum] = await Promise.all([
      this.schedules.findForEdition(edition.id),
      this.minimumOf(edition.id),
    ]);
    const phase = fairPhase(schedule, now);
    const context: ContingencyContext = {
      edicion: { id: edition.id, title: edition.title },
      fase: phase,
      base: isControlReached(phase) ? 'PRESENT' : 'ASSIGNED',
      minimoEvaluaciones: minimum,
      generadoEn: now,
    };
    const teams = await this.loadTeams(edition.id, now);
    return { context, teams, edition };
  }

  private async loadTeams(
    editionId: number,
    now: Date,
  ): Promise<ContingencyTeamInput[]> {
    const teams = await this.prisma.team.findMany({
      where: { editionId, isActive: true, ...ASSIGNABLE_TEAM },
      orderBy: { teamCode: 'asc' },
      select: {
        id: true,
        teamCode: true,
        teamName: true,
        videogame: { select: { id: true, name: true } },
        // Mismo criterio que el panel de HU-12: solo cuentan los jurados de la edición.
        assignedJurors: {
          where: jurorsOfEdition(editionId),
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jurorCategory: true,
            role: { select: { name: true } },
          },
        },
      },
    });
    const videogameIds = teams.flatMap((t) =>
      t.videogame ? [t.videogame.id] : [],
    );
    const [attendances, evaluations, presence, notComing] = await Promise.all([
      this.prisma.jurorAttendance.findMany({
        where: { editionId, isActive: true },
        select: { jurorId: true },
      }),
      this.prisma.evaluation.findMany({
        where: { editionId, isActive: true, videogameId: { in: videogameIds } },
        select: { videogameId: true, jurorId: true },
      }),
      this.presence.list({ indicator: 'POSSIBLE_LEFT' }, now),
      loadNotComing(this.prisma, editionId),
    ]);
    const arrived = new Set(attendances.map((a) => a.jurorId));
    const evaluated = new Set(
      evaluations.map((e) => `${e.videogameId}:${e.jurorId}`),
    );
    // Se retiró: sin actividad (posible salida) y sin responder «Sigo aquí» (presencia sin
    // confirmar). Solo la primera señal marca también a quien califica despacio.
    const possibleLeft = new Set(
      presence.data
        .filter((item) => item.indicators.includes('PRESENCE_UNCONFIRMED'))
        .map((item) => item.jurorId),
    );

    return teams.map((team) => ({
      id: team.id,
      teamCode: team.teamCode,
      teamName: team.teamName,
      videogame: team.videogame?.name ?? null,
      level: extractTeamLevel(team.teamCode),
      jurors: team.assignedJurors.map((juror) => ({
        id: juror.id,
        name: fullName(juror),
        category: categoryOf(juror),
        checkedIn: arrived.has(juror.id),
        possibleLeft: possibleLeft.has(juror.id),
        notComing: notComing.has(juror.id),
        evaluated: evaluated.has(`${team.videogame?.id}:${juror.id}`),
      })),
    }));
  }

  /**
   * Suplentes (tipo Suplente) confirmados en la edición, con sus grupos y su llegada. No se propone
   * al suplente que «No podrá asistir» (HU-44).
   */
  private async loadSubstitutes(editionId: number): Promise<SubstituteInput[]> {
    const notComing = await loadNotComing(this.prisma, editionId);
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { name: JUROR_ROLE_NAME },
        jurorEditions: {
          some: {
            editionId,
            type: JurorType.BACKUP,
            status: JurorEditionStatus.CONFIRMED,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jurorCategory: true,
        attendances: {
          where: { editionId, isActive: true },
          select: { id: true },
          take: 1,
        },
        teamsToEvaluate: {
          where: { editionId, isActive: true },
          select: { id: true, teamCode: true },
        },
      },
    });
    const available = users.filter(
      (user) => user.attendances.length > 0 || !notComing.has(user.id),
    );
    return available.map((user) => ({
      id: user.id,
      name: fullName(user),
      category: user.jurorCategory,
      checkedIn: user.attendances.length > 0,
      teams: user.teamsToEvaluate.map((team) => ({
        id: team.id,
        level: extractTeamLevel(team.teamCode),
      })),
    }));
  }

  /**
   * Advertencias de HU-08 si se aceptan todos los sugeridos a la vez. Cada una va al grupo que
   * nombra; las que solo nombran al suplente (más de 3 grupos, niveles mezclados) van a cada grupo
   * donde se le sugiere; las generales, a todos.
   */
  private async withWarnings(
    suggestions: GroupSuggestion[],
    substitutes: SubstituteInput[],
    teams: ContingencyTeamInput[],
    edition: ActiveEdition,
    minimum: number,
  ): Promise<GroupSuggestionWithWarnings[]> {
    const pairs = suggestions.flatMap((group) =>
      group.sugeridos.map((s) => ({ teamId: group.teamId, jurorId: s.id })),
    );
    if (pairs.length === 0) {
      return suggestions.map((group) => ({ ...group, advertencias: [] }));
    }
    const suggestedIds = new Set(pairs.map((p) => p.jurorId));
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const { warnings } = await this.assignmentValidation.validate({
      activeEdition: { id: edition.id, title: edition.title },
      limits: { minJurorsPerTeam: minimum },
      teams: suggestions.map((group) => ({
        id: group.teamId,
        teamCode: group.codigo,
        editionId: edition.id,
        jurorIds: teamById.get(group.teamId)!.jurors.map((juror) => juror.id),
      })),
      evaluators: substitutes
        .filter((s) => suggestedIds.has(s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          kind: 'JUROR' as const,
          jurorCategory: s.category,
          participatesInActiveEdition: true,
        })),
      changes: pairs.map((p) => ({ type: 'ADD' as const, ...p })),
    });

    return suggestions.map((group) => {
      const suggested = new Set(group.sugeridos.map((s) => s.id));
      return {
        ...group,
        advertencias: warnings.filter((w) =>
          w.teamId !== undefined
            ? w.teamId === group.teamId
            : w.jurorId !== undefined
              ? suggested.has(w.jurorId)
              : true,
        ),
      };
    });
  }
}
