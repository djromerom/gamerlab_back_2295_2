import {
  BadRequestException,
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
import {
  JUROR_ROLE_NAME,
  PROFESSOR_ROLE_NAME,
} from 'src/jurors/juror-badges/juror-label';
import { JurorAssignmentAuditService } from 'src/jurors/juror/assignment-audit/juror-assignment-audit.service';
import {
  findTeamNotConfirmedBlocker,
  findTeamNotGradableBlocker,
} from 'src/jurors/juror/assignment-validation/assignment-rules';
import { AssignmentWarning } from 'src/jurors/juror/assignment-validation/assignment-rules.types';
import { AssignmentValidationService } from 'src/jurors/juror/assignment-validation/assignment-validation.service';
import { SubstituteNoticesService } from 'src/jurors/substitute-notices/substitute-notices.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AssignmentPushNotifier } from 'src/push-notifications/assignment-push-notifier.service';
import { AcceptSubstituteSuggestionsDto } from './dto/accept-substitute-suggestions.dto';
import { RejectSubstituteSuggestionDto } from './dto/reject-substitute-suggestion.dto';
import { JurorContingencyService } from './juror-contingency.service';
import {
  AcceptSuggestionsResult,
  CONTINGENCY_AUDIT_NOTE,
  NO_SUGGESTION_TO_REJECT,
  NOT_A_SUBSTITUTE,
  RejectSuggestionResult,
  TEAM_NOT_FOUND,
  TeamRef,
} from './types/juror-contingency.types';

const EVALUATOR_ROLES = {
  name: { in: [JUROR_ROLE_NAME, PROFESSOR_ROLE_NAME] },
};

type Person = { id: string; firstName: string | null; lastName: string | null };
const fullName = (p: Person) =>
  `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
const count = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

type LoadedTeam = Awaited<
  ReturnType<ContingencyAssignmentService['loadTeams']>
>[number];
const ref = (team: LoadedTeam): TeamRef => ({
  id: team.id,
  codigo: team.teamCode,
  nombre: team.teamName,
});

/**
 * HU-14 (ARK-213): aceptar o rechazar la sugerencia de suplentes.
 *
 * - **Aceptar** (un grupo, todos, o un suplente elegido a mano de las alternativas) **solo suma**:
 *   los jurados del grupo conservan su lugar, también el que llegue tarde, y las evaluaciones no se
 *   tocan. Reglas de HU-08 sobre todos los pares nuevos juntos (bloqueos y advertencias con
 *   `confirmWarnings`). Una transacción con los pares, una fila de bitácora por par y un aviso de
 *   HU-22 por suplente; la notificación push y el correo salen después de confirmar.
 * - **Rechazar** deja registro (quién, cuándo, por qué) en `rechazo_sugerencia_suplente` y no
 *   cambia ninguna asignación.
 */
@Injectable()
export class ContingencyAssignmentService {
  private readonly logger = new Logger(ContingencyAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contingency: JurorContingencyService,
    private readonly assignmentValidation: AssignmentValidationService,
    private readonly audit: JurorAssignmentAuditService,
    private readonly substituteNotices: SubstituteNoticesService,
    private readonly pushNotifier: AssignmentPushNotifier,
  ) {}

  async accept(
    dto: AcceptSubstituteSuggestionsDto,
    actorUserId: string,
  ): Promise<AcceptSuggestionsResult> {
    try {
      const edition = await requireActiveEdition(this.prisma);
      const pairs = this.uniquePairs(dto);
      const substitutes = await this.requireSubstitutes(
        [...new Set(pairs.map((p) => p.substituteId))],
        edition,
      );
      const teams = await this.loadTeams([
        ...new Set(pairs.map((p) => p.teamId)),
      ]);
      const teamById = new Map(teams.map((team) => [team.id, team]));

      const hasJuror = (p: (typeof pairs)[number]) =>
        teamById
          .get(p.teamId)!
          .assignedJurors.some((juror) => juror.id === p.substituteId);
      const added = pairs.filter((p) => !hasJuror(p));
      const skipped = pairs.filter(hasJuror);

      let accepted: AssignmentWarning[] = [];
      if (added.length > 0) {
        accepted = await this.validate(
          added,
          teamById,
          substitutes,
          edition,
          dto,
        );
        const noticeIds = await this.prisma.$transaction(
          (tx) => this.save(tx, added, actorUserId, accepted, edition),
          { maxWait: 10_000, timeout: 60_000 },
        );
        this.pushNotifier.notifyAssignmentChanged(
          added.map((p) => p.substituteId),
        );
        this.substituteNotices.sendEmailAfterCommit(noticeIds);
      }

      const suplentes = [...substitutes.values()]
        .map((s) => ({
          id: s.id,
          nombre: fullName(s),
          equiposAgregados: added
            .filter((p) => p.substituteId === s.id)
            .map((p) => ref(teamById.get(p.teamId)!)),
          equiposYaAsignados: skipped
            .filter((p) => p.substituteId === s.id)
            .map((p) => ref(teamById.get(p.teamId)!)),
        }))
        .filter(
          (s) => s.equiposAgregados.length + s.equiposYaAsignados.length > 0,
        );

      return {
        message:
          added.length > 0
            ? `Se ${added.length === 1 ? 'agregó' : 'agregaron'} ${count(added.length, 'asignación', 'asignaciones')} de suplentes en ${count(new Set(added.map((p) => p.teamId)).size, 'grupo', 'grupos')}. Nadie perdió grupos.`
            : 'No había asignaciones nuevas: los suplentes ya estaban en esos grupos.',
        edicion: { id: edition.id, title: edition.title },
        suplentes,
        totales: {
          asignacionesAgregadas: added.length,
          asignacionesOmitidas: skipped.length,
        },
        advertenciasAceptadas: accepted,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('HU-14: error al aceptar suplentes:', error);
      throw new InternalServerErrorException(
        'No se pudieron guardar los suplentes. Se revirtió todo y no cambió ninguna asignación.',
      );
    }
  }

  async reject(
    dto: RejectSubstituteSuggestionDto,
    actorUserId: string,
    now: Date = new Date(),
  ): Promise<RejectSuggestionResult> {
    const edition = await requireActiveEdition(this.prisma);
    const team = await this.prisma.team.findFirst({
      where: { id: dto.teamId, editionId: edition.id, isActive: true },
      select: { id: true, teamCode: true, teamName: true },
    });
    if (!team) {
      throw new NotFoundException({
        statusCode: 404,
        code: TEAM_NOT_FOUND,
        message: `El grupo ${dto.teamId} no existe o no es de «${edition.title}».`,
      });
    }

    let substitutes: Array<{ id: string; nombre: string }>;
    if (dto.substituteIds?.length) {
      const found = await this.requireSubstitutes(dto.substituteIds, edition);
      substitutes = dto.substituteIds.map((id) => ({
        id,
        nombre: fullName(found.get(id)!),
      }));
    } else {
      // Sin suplentes indicados: se rechaza la sugerencia actual del grupo.
      const { grupos } = await this.contingency.getSuggestions(now);
      const group = grupos.find((g) => g.teamId === team.id);
      if (!group || group.sugeridos.length === 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: NO_SUGGESTION_TO_REJECT,
          message: `El grupo ${team.teamCode} no tiene una sugerencia de suplentes que rechazar.`,
        });
      }
      substitutes = group.sugeridos.map((s) => ({
        id: s.id,
        nombre: s.nombre,
      }));
    }

    const reason = dto.reason?.trim() || null;
    const rejectedAt = new Date();
    await this.prisma.substituteSuggestionRejection.createMany({
      data: substitutes.map((s) => ({
        editionId: edition.id,
        teamId: team.id,
        substituteId: s.id,
        reason,
        rejectedById: actorUserId,
        createdAt: rejectedAt,
      })),
    });

    return {
      message: `Se rechazó la sugerencia para ${team.teamCode}: ${substitutes.map((s) => s.nombre).join(', ')} no se volverá${substitutes.length === 1 ? '' : 'n'} a sugerir para este grupo. Puedes asignar a mano a otro suplente.`,
      equipo: { id: team.id, codigo: team.teamCode, nombre: team.teamName },
      suplentesRechazados: substitutes,
      motivo: reason,
      rechazadoEn: rejectedAt,
    };
  }

  private uniquePairs(dto: AcceptSubstituteSuggestionsDto) {
    const seen = new Set<string>();
    return dto.assignments.filter((p) => {
      const key = `${p.teamId}:${p.substituteId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Suplentes (tipo Suplente) confirmados de la edición activa; si alguno no lo es, 400. */
  private async requireSubstitutes(ids: string[], edition: ActiveEdition) {
    const found = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        role: { name: JUROR_ROLE_NAME },
        jurorEditions: {
          some: {
            editionId: edition.id,
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
      },
    });
    const byId = new Map(found.map((user) => [user.id, user]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: NOT_A_SUBSTITUTE,
        message: `${missing.length === 1 ? 'Un usuario elegido no es' : `${missing.length} usuarios elegidos no son`} suplente confirmado de «${edition.title}». No se guardó nada.`,
        substituteIds: missing,
      });
    }
    return byId;
  }

  /** Grupos elegidos con sus jurados actuales. 404 si alguno no existe o está inactivo. */
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
        message: `${missing.length === 1 ? 'Un grupo elegido no existe o está inactivo' : `${missing.length} grupos elegidos no existen o están inactivos`}. No se guardó nada.`,
        teamIds: missing,
      });
    }
    return found;
  }

  /** Bloqueos de equipo y reglas de HU-08 de todos los pares nuevos. Devuelve las aceptadas. */
  private async validate(
    added: Array<{ teamId: number; substituteId: string }>,
    teamById: Map<number, LoadedTeam>,
    substitutes: Map<string, Person & { jurorCategory: JurorCategory | null }>,
    edition: ActiveEdition,
    dto: AcceptSubstituteSuggestionsDto,
  ): Promise<AssignmentWarning[]> {
    const teams = [...new Set(added.map((p) => p.teamId))].map(
      (id) => teamById.get(id)!,
    );
    const teamBlockers = teams.flatMap((team) => {
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

    const minimum = await this.contingency.minimumOf(edition.id);
    const result = await this.assignmentValidation.validate({
      activeEdition: { id: edition.id, title: edition.title },
      limits: { minJurorsPerTeam: minimum },
      teams: teams.map((team) => ({
        id: team.id,
        teamCode: team.teamCode,
        editionId: team.editionId,
        editionTitle: team.edition.title,
        jurorIds: team.assignedJurors.map((juror) => juror.id),
      })),
      evaluators: [...new Set(added.map((p) => p.substituteId))].map((id) => {
        const s = substitutes.get(id)!;
        return {
          id,
          name: fullName(s),
          kind: 'JUROR' as const,
          jurorCategory: s.jurorCategory,
          participatesInActiveEdition: true,
        };
      }),
      changes: added.map((p) => ({
        type: 'ADD' as const,
        jurorId: p.substituteId,
        teamId: p.teamId,
      })),
    });
    return this.assignmentValidation.enforce(
      result,
      dto.confirmWarnings ?? false,
    );
  }

  /** Pares, bitácora y un aviso de HU-22 por suplente, en la misma transacción. */
  private async save(
    tx: Prisma.TransactionClient,
    added: Array<{ teamId: number; substituteId: string }>,
    actorUserId: string,
    accepted: AssignmentWarning[],
    edition: ActiveEdition,
  ): Promise<Array<number | null>> {
    for (const pair of added) {
      // `connect` agrega sin quitar a nadie: los jurados del grupo conservan su lugar.
      await tx.team.update({
        where: { id: pair.teamId },
        data: { assignedJurors: { connect: { id: pair.substituteId } } },
      });
      await this.audit.create(
        {
          action: ManualJurorAssignmentAction.ASSIGN,
          actorUserId,
          teamId: pair.teamId,
          jurorId: pair.substituteId,
          newJurorId: pair.substituteId,
          notes: AssignmentValidationService.auditNote(
            CONTINGENCY_AUDIT_NOTE,
            accepted,
          ),
        },
        tx,
      );
    }
    const noticeIds: Array<number | null> = [];
    for (const substituteId of new Set(added.map((p) => p.substituteId))) {
      noticeIds.push(
        await this.substituteNotices.recordAssignment(tx, {
          jurorId: substituteId,
          teamIds: added
            .filter((p) => p.substituteId === substituteId)
            .map((p) => p.teamId),
          editionId: edition.id,
        }),
      );
    }
    return noticeIds;
  }
}
