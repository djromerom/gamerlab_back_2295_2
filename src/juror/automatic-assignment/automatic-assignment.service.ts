import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JurorType, ManualJurorAssignmentAction, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AssignmentPushNotifier } from '../../push-notifications/assignment-push-notifier.service';
import {
  EDITION_READ_ONLY,
  requireActiveEdition,
} from '../../editions/active-edition';
import {
  resolveEdition,
  ResolvedEdition,
  toEditionSummary,
} from '../../juror-edition/edition-resolver';
import { jurorsOfEdition } from '../../juror-edition/jurors-of-edition';
import {
  JUROR_ROLE_NAME,
  PROFESSOR_ROLE_NAME,
} from '../../juror-badges/juror-label';
import { findBlockers } from '../assignment-validation/assignment-rules';
import { DEFAULT_ASSIGNMENT_LIMITS } from '../assignment-validation/assignment-rules.types';
import {
  AutoAssignmentConfirmDto,
  AutoAssignmentLimitsDto,
  AutoAssignmentPreviewDto,
} from '../dto/automatic-assignment.dto';
import { planAutomaticAssignment } from './automatic-assignment.planner';
import {
  AutoAssignmentLimits,
  AutoAssignmentPlan,
  PlannedAssignment,
  PlannerEvaluator,
  PlannerInput,
} from './automatic-assignment.types';

export const AUTO_ASSIGNMENT_OUTDATED_CODE = 'AUTO_ASSIGNMENT_OUTDATED';
export const AUTO_ASSIGNMENT_AUDIT_NOTE = 'Asignación automática (HU-07).';
const CONFIRMED_VIDEOGAME_STATUS = 'CONFIRMADO';

type Db = Prisma.TransactionClient;

export interface AutoAssignmentPreview extends AutoAssignmentPlan {
  edition: ReturnType<typeof toEditionSummary>;
  /** Remanentes confirmados de la edición que la automática deja de reserva (HU-09). */
  backupJurorsExcluded: number;
}

export interface AutoAssignmentConfirmResult {
  message: string;
  edition: ReturnType<typeof toEditionSummary>;
  saved: number;
  teamsUpdated: number;
  summary: AutoAssignmentPlan['summary'];
  alerts: AutoAssignmentPlan['alerts'];
}

/**
 * HU-07 (ARK-114): asignación automática en dos pasos.
 * - `preview`: arma la foto de la edición y calcula el plan, sin guardar.
 * - `confirm`: vuelve a calcular sobre la edición activa dentro de una
 *   transacción; si el plan ya no es el mismo responde 409 y no guarda nada.
 *   Si coincide, agrega las asignaciones y su bitácora; ante cualquier error
 *   se revierte todo. Un `editionId` que no sea el de la activa da 400
 *   `EDITION_READ_ONLY`. `maxTeamsPerJuror` debe ser el mismo de la vista
 *   previa: con otro límite el plan sale distinto y responde 409.
 *
 * Límite conocido (concurrencia): `confirm` no toma ningún bloqueo. Dos
 * confirmaciones simultáneas, o una asignación manual que se guarde mientras
 * corre la transacción, no se detectan entre sí: las dos leen la misma foto y
 * pueden dejar un grupo o un jurado por encima de los límites (`connect` no
 * duplica el par equipo-jurado, pero la bitácora sí quedaría doble). Es una
 * operación de un administrador, unas pocas veces por edición; si se vuelve un
 * problema, la solución es un `pg_advisory_xact_lock` al inicio de la
 * transacción (y en la asignación manual).
 *
 * El algoritmo está documentado en `automatic-assignment.planner.ts`.
 */
@Injectable()
export class AutomaticAssignmentService {
  private readonly logger = new Logger(AutomaticAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    // HU-37: se llama después de confirmar la transacción; no espera ni puede fallar.
    private readonly pushNotifier: AssignmentPushNotifier,
  ) {}

  async preview(dto: AutoAssignmentPreviewDto): Promise<AutoAssignmentPreview> {
    const edition = dto.editionId
      ? await resolveEdition(this.prisma, dto.editionId)
      : await requireActiveEdition(this.prisma);
    const { input, backupJurorsExcluded } = await this.loadSnapshot(
      this.prisma,
      edition,
      this.limitsFrom(dto),
    );
    this.assertCanPlan(input, edition);

    return {
      edition: toEditionSummary(edition),
      backupJurorsExcluded,
      ...planAutomaticAssignment(input),
    };
  }

  async confirm(
    dto: AutoAssignmentConfirmDto,
    actorUserId: string,
  ): Promise<AutoAssignmentConfirmResult> {
    const edition = await requireActiveEdition(this.prisma);
    this.assertIsActiveEdition(dto.editionId, edition);
    const limits = this.limitsFrom(dto);

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const { input } = await this.loadSnapshot(tx, edition, limits);
          this.assertCanPlan(input, edition);
          const plan = planAutomaticAssignment(input);

          if (!sameAssignments(plan.assignments, dto.assignments)) {
            throw new ConflictException({
              statusCode: 409,
              code: AUTO_ASSIGNMENT_OUTDATED_CODE,
              message:
                'La asignación cambió desde la vista previa (equipos, jurados o asignaciones nuevas). No se guardó nada: genera la vista previa otra vez.',
            });
          }
          this.assertNoBlockers(input, plan.assignments, edition);

          const teamsUpdated = await this.save(tx, plan, actorUserId);
          return {
            message:
              plan.assignments.length > 0
                ? `Se guardaron ${plan.assignments.length} asignaciones en ${teamsUpdated} grupos.`
                : 'No había asignaciones nuevas por guardar.',
            edition: toEditionSummary(edition),
            saved: plan.assignments.length,
            teamsUpdated,
            summary: plan.summary,
            alerts: plan.alerts,
          };
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
      // `sameAssignments` ya comprobó que la lista recibida es el plan que se guardó.
      this.pushNotifier.notifyAssignmentChanged(
        dto.assignments.map((assignment) => assignment.jurorId),
      );
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Error al guardar la asignación automática:', error);
      throw new InternalServerErrorException(
        'No se pudo guardar la asignación automática. Se revirtió todo y se mantienen las asignaciones anteriores.',
      );
    }
  }

  private limitsFrom(dto: AutoAssignmentLimitsDto): AutoAssignmentLimits {
    return {
      maxTeamsPerJuror:
        dto.maxTeamsPerJuror ?? DEFAULT_ASSIGNMENT_LIMITS.maxTeamsPerJuror,
      jurorsPerTeam: DEFAULT_ASSIGNMENT_LIMITS.minJurorsPerTeam,
    };
  }

  /** Solo se guarda en la edición activa: las demás son de solo lectura (ARK-130). */
  private assertIsActiveEdition(
    editionId: number | undefined,
    active: ResolvedEdition,
  ) {
    if (editionId === undefined || editionId === active.id) return;
    throw new BadRequestException({
      statusCode: 400,
      code: EDITION_READ_ONLY,
      message: `La asignación automática solo se confirma en la edición activa («${active.title}», id ${active.id}). La edición ${editionId} es de solo lectura: la vista previa con editionId es solo una simulación. No se guardó nada.`,
    });
  }

  private assertCanPlan(input: PlannerInput, edition: ResolvedEdition) {
    if (!input.teams.some((team) => team.assignable)) {
      throw new BadRequestException(
        `No hay equipos activos con videojuego confirmado en la edición "${edition.title}".`,
      );
    }
    if (input.jurors.length === 0) {
      throw new BadRequestException(
        `No hay jurados oficiales en la edición "${edition.title}": confirma los jurados en "Jurados de la edición" o carga los NRC de los profesores.`,
      );
    }
  }

  /**
   * Defensa extra: los bloqueos de HU-08 sobre el plan completo, incluidos los
   * de edición activa de ARK-131. Equipos y jurados salen de la edición activa,
   * así que nunca deberían dispararse.
   */
  private assertNoBlockers(
    input: PlannerInput,
    added: PlannedAssignment[],
    edition: ResolvedEdition,
  ) {
    const blockers = findBlockers({
      teams: input.teams.map((team) => ({
        id: team.id,
        teamCode: team.teamCode,
        editionId: edition.id,
        editionTitle: edition.title,
        jurorIds: team.assigned.map((e) => e.id),
      })),
      // Salen de `jurorsOfEdition`: participan en la edición activa.
      evaluators: input.jurors.map((juror) => ({
        ...juror,
        participatesInActiveEdition: true,
      })),
      activeEdition: { id: edition.id, title: edition.title },
      changes: added.map((a) => ({ type: 'ADD' as const, ...a })),
    });
    if (blockers.length > 0) {
      this.logger.error('El plan automático rompe bloqueos:', blockers);
      throw new InternalServerErrorException(
        `La asignación automática generó una asignación inválida (${blockers[0].message}). No se guardó nada.`,
      );
    }
  }

  private async save(
    tx: Db,
    plan: AutoAssignmentPlan,
    actorUserId: string,
  ): Promise<number> {
    const byTeam = new Map<number, string[]>();
    for (const { teamId, jurorId } of plan.assignments) {
      byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), jurorId]);
    }

    // `connect` agrega sin quitar a nadie: lo existente es fijo (P-21).
    for (const [teamId, jurorIds] of byTeam) {
      await tx.team.update({
        where: { id: teamId },
        data: { assignedJurors: { connect: jurorIds.map((id) => ({ id })) } },
      });
    }

    if (plan.assignments.length > 0) {
      await tx.jurorAssignmentAuditLog.createMany({
        data: plan.assignments.map(({ teamId, jurorId }) => ({
          action: ManualJurorAssignmentAction.ASSIGN,
          actorUserId,
          teamId,
          jurorId,
          newJurorId: jurorId,
          notes: AUTO_ASSIGNMENT_AUDIT_NOTE,
        })),
      });
    }
    return byTeam.size;
  }

  /** Foto de la edición: equipos con sus jurados fijos y jurados oficiales. */
  private async loadSnapshot(
    db: Db,
    edition: ResolvedEdition,
    limits: AutoAssignmentLimits,
  ): Promise<{ input: PlannerInput; backupJurorsExcluded: number }> {
    const evaluatorSelect = {
      id: true,
      firstName: true,
      lastName: true,
      jurorCategory: true,
      role: { select: { name: true } },
    } as const;
    const activeNrcIds = {
      where: { isActive: true },
      select: { id: true },
    } as const;

    const [teams, users] = await Promise.all([
      db.team.findMany({
        where: { editionId: edition.id, isActive: true },
        select: {
          id: true,
          teamCode: true,
          teamName: true,
          videogame: {
            select: { videogameStatus: { select: { status: true } } },
          },
          assignedJurors: {
            where: {
              isActive: true,
              role: { name: { in: [JUROR_ROLE_NAME, PROFESSOR_ROLE_NAME] } },
            },
            select: evaluatorSelect,
          },
          members: {
            where: { isActive: true },
            select: { nrcs: activeNrcIds },
          },
        },
      }),
      db.user.findMany({
        where: jurorsOfEdition(edition.id),
        select: {
          ...evaluatorSelect,
          managedNrcs: activeNrcIds,
          jurorEditions: {
            where: { editionId: edition.id },
            select: { type: true },
          },
        },
      }),
    ]);

    // Remanentes: el tipo por edición manda (HU-25); los profesores no tienen fila.
    const isBackup = (u: (typeof users)[number]) =>
      u.jurorEditions.some((je) => je.type === JurorType.BACKUP);
    const officials = users.filter((u) => !isBackup(u));

    return {
      backupJurorsExcluded: users.length - officials.length,
      input: {
        limits,
        teams: teams.map((team) => ({
          id: team.id,
          teamCode: team.teamCode,
          teamName: team.teamName,
          assignable:
            team.videogame?.videogameStatus.status ===
            CONFIRMED_VIDEOGAME_STATUS,
          assigned: team.assignedJurors.map(toEvaluator),
          memberNrcIds: [
            ...new Set(
              team.members.flatMap((m) => m.nrcs.map((nrc) => nrc.id)),
            ),
          ],
        })),
        jurors: officials.map((u) => ({
          ...toEvaluator(u),
          managedNrcIds: u.managedNrcs.map((nrc) => nrc.id),
        })),
      },
    };
  }
}

function toEvaluator(user: {
  id: string;
  firstName: string;
  lastName: string;
  jurorCategory: PlannerEvaluator['jurorCategory'];
  role: { name: string };
}): PlannerEvaluator {
  return {
    id: user.id,
    name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
    kind:
      user.role.name === PROFESSOR_ROLE_NAME
        ? 'PROFESSOR'
        : user.role.name === JUROR_ROLE_NAME
          ? 'JUROR'
          : 'OTHER',
    jurorCategory: user.jurorCategory,
  };
}

function sameAssignments(
  planned: PlannedAssignment[],
  received: PlannedAssignment[],
): boolean {
  const key = (a: PlannedAssignment) => `${a.teamId}:${a.jurorId}`;
  const plannedKeys = new Set(planned.map(key));
  const receivedKeys = new Set(received.map(key));
  return (
    planned.length === received.length &&
    plannedKeys.size === receivedKeys.size &&
    [...receivedKeys].every((k) => plannedKeys.has(k))
  );
}
