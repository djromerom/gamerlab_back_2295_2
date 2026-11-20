import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
import { PrismaService } from 'src/prisma/prisma.service';
import { AssignmentPushNotifier } from 'src/push-notifications/assignment-push-notifier.service';
import { SubstituteNoticesService } from 'src/jurors/substitute-notices/substitute-notices.service';
import { JurorAssignmentAuditService } from '../assignment-audit/juror-assignment-audit.service';
import {
  findTeamNotConfirmedBlocker,
  findTeamNotGradableBlocker,
} from '../assignment-validation/assignment-rules';
import { AssignmentWarning } from '../assignment-validation/assignment-rules.types';
import { AssignmentValidationService } from '../assignment-validation/assignment-validation.service';
import { BulkAssignSubstitutesDto } from '../dto/bulk-assign-substitutes.dto';

/** 400: algún id de `substituteIds` no es suplente confirmado de la edición activa. */
export const NOT_A_SUBSTITUTE = 'NOT_A_SUBSTITUTE';
/** 400: algún id de `jurorIds` no es una cuenta activa de jurado o profesor. */
export const NOT_AN_EVALUATOR = 'NOT_AN_EVALUATOR';
/** 400: el mismo usuario viene como jurado a cubrir y como suplente. */
export const SUBSTITUTE_IS_COVERED_JUROR = 'SUBSTITUTE_IS_COVERED_JUROR';
/** 400: los jurados elegidos no tienen grupos asignables en la edición activa. */
export const NO_TEAMS_TO_COVER = 'NO_TEAMS_TO_COVER';

/** Inicio de la nota de bitácora de cada asignación de esta operación (para filtrarla). */
export const SUBSTITUTE_BULK_AUDIT_NOTE =
  'Suplente en lote desde módulo admin (HU-09).';

const EVALUATOR_ROLES = {
  name: { in: [JUROR_ROLE_NAME, PROFESSOR_ROLE_NAME] },
};

type Person = { id: string; firstName: string | null; lastName: string | null };
type Substitute = Person & { jurorCategory: JurorCategory | null };
type TargetTeam = Awaited<
  ReturnType<SubstituteAssignmentService['loadTargetTeams']>
>[number];

export interface TeamSummary {
  id: number;
  codigo: string;
  nombre: string;
}

interface SubstitutePlan {
  substitute: Substitute;
  added: TargetTeam[];
  skipped: TargetTeam[];
}

const fullName = (person: Person) =>
  `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();

const summary = (team: TargetTeam): TeamSummary => ({
  id: team.id,
  codigo: team.teamCode,
  nombre: team.teamName,
});

const count = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

/**
 * HU-09 (ARK-215): asigna uno o varios suplentes a todos los grupos de uno o varios jurados en
 * una sola operación.
 *
 * - **Solo suma.** Cada suplente se agrega a cada grupo que hoy tienen los jurados elegidos en la
 *   edición activa. Nadie pierde grupos y las evaluaciones hechas no se tocan. Un grupo puede
 *   quedar con más de 3 jurados (HU-08 no lo limita; solo cuentan las 3 primeras, P-10).
 * - Los pares que ya existen se omiten sin error (repetir la operación no duplica nada).
 * - Los grupos sin confirmar o no calificables no reciben jurados (BG-35, HU-39): se omiten y se
 *   informan en la respuesta.
 * - Reglas de HU-08 sobre TODOS los pares nuevos a la vez: un bloqueo frena todo y las
 *   advertencias piden confirmación (409 `ASSIGNMENT_WARNINGS`, igual que asignar a mano).
 * - Una sola transacción: pares, una fila de bitácora por par (acción ASSIGN) y un aviso de HU-22
 *   por suplente con todos sus grupos nuevos. Si algo falla, no cambia ninguna asignación. El
 *   aviso push y el correo salen después de confirmar.
 *
 * Igual que `assign()`, las reglas se revisan antes de abrir la transacción: dos operaciones
 * simultáneas sobre los mismos grupos no se detectan entre sí (`connect` no duplica el par, pero
 * la bitácora quedaría doble).
 */
@Injectable()
export class SubstituteAssignmentService {
  private readonly logger = new Logger(SubstituteAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jurorAssignmentAuditService: JurorAssignmentAuditService,
    private readonly assignmentValidation: AssignmentValidationService,
    // HU-37: después de confirmar la transacción; no espera ni puede fallar.
    private readonly pushNotifier: AssignmentPushNotifier,
    // HU-22: aviso al suplente dentro de la transacción; el correo, después.
    private readonly substituteNotices: SubstituteNoticesService,
  ) {}

  async assignToJurorsTeams(
    dto: BulkAssignSubstitutesDto,
    actorUserId: string,
  ) {
    const jurorIds = [...new Set(dto.jurorIds)];
    const substituteIds = [...new Set(dto.substituteIds)];

    try {
      this.assertDisjoint(jurorIds, substituteIds);
      const edition = await requireActiveEdition(this.prisma);
      const covered = await this.loadCoveredJurors(jurorIds);
      const substitutes = await this.loadSubstitutes(substituteIds, edition);
      const teams = await this.loadTargetTeams(jurorIds, edition);

      const notAssignable = teams.flatMap((team) => {
        const blocker =
          findTeamNotConfirmedBlocker(team) ?? findTeamNotGradableBlocker(team);
        return blocker ? [{ team, code: blocker.code }] : [];
      });
      const assignable = teams.filter(
        (team) => !notAssignable.some((item) => item.team.id === team.id),
      );
      if (assignable.length === 0) {
        throw new BadRequestException({
          statusCode: 400,
          code: NO_TEAMS_TO_COVER,
          message:
            notAssignable.length > 0
              ? `Los jurados seleccionados no tienen grupos confirmados en «${edition.title}» para cubrir (${count(notAssignable.length, 'grupo está', 'grupos están')} sin confirmar o no se califican). No se asignó nada.`
              : `Los jurados seleccionados no tienen grupos en «${edition.title}» para cubrir. No se asignó nada.`,
        });
      }

      const plans: SubstitutePlan[] = substitutes.map((substitute) => ({
        substitute,
        added: assignable.filter((team) => !this.hasJuror(team, substitute.id)),
        skipped: assignable.filter((team) =>
          this.hasJuror(team, substitute.id),
        ),
      }));
      const pairs = plans.flatMap((plan) =>
        plan.added.map((team) => ({
          type: 'ADD' as const,
          jurorId: plan.substitute.id,
          teamId: team.id,
        })),
      );

      let acceptedWarnings: AssignmentWarning[] = [];
      if (pairs.length > 0) {
        // HU-08 sobre todos los pares nuevos juntos: bloqueos y advertencias de una vez.
        const result = await this.assignmentValidation.validate({
          activeEdition: { id: edition.id, title: edition.title },
          teams: assignable.map((team) => ({
            id: team.id,
            teamCode: team.teamCode,
            editionId: team.editionId,
            editionTitle: edition.title,
            jurorIds: team.assignedJurors.map((juror) => juror.id),
          })),
          // Rol Jurado y confirmados en la edición: participan en ella (HU-25).
          evaluators: substitutes.map((substitute) => ({
            id: substitute.id,
            name: fullName(substitute),
            kind: 'JUROR' as const,
            jurorCategory: substitute.jurorCategory,
            participatesInActiveEdition: true,
          })),
          changes: pairs,
        });
        acceptedWarnings = this.assignmentValidation.enforce(
          result,
          dto.confirmWarnings ?? false,
        );

        const noticeIds = await this.prisma.$transaction(
          (tx) =>
            this.save(
              tx,
              plans,
              covered,
              jurorIds,
              actorUserId,
              acceptedWarnings,
              edition,
            ),
          { maxWait: 10_000, timeout: 60_000 },
        );

        this.pushNotifier.notifyTeamsAssigned(
          plans.flatMap((plan) =>
            plan.added.map((team) => ({
              jurorId: plan.substitute.id,
              teamId: team.id,
            })),
          ),
        );
        this.substituteNotices.sendEmailAfterCommit(noticeIds);
      }

      const added = pairs.length;
      const skipped = plans.reduce(
        (total, plan) => total + plan.skipped.length,
        0,
      );
      const teamsWithAdditions = new Set(pairs.map((pair) => pair.teamId)).size;

      return {
        message:
          added > 0
            ? `Se ${added === 1 ? 'agregó' : 'agregaron'} ${count(added, 'asignación', 'asignaciones')} de suplentes en ${count(teamsWithAdditions, 'grupo', 'grupos')}. Nadie perdió grupos.`
            : 'No había asignaciones nuevas: los suplentes ya tenían todos los grupos de los jurados seleccionados.',
        edicion: { id: edition.id, title: edition.title },
        suplentes: plans.map((plan) => ({
          id: plan.substitute.id,
          nombre: fullName(plan.substitute),
          equiposAgregados: plan.added.map(summary),
          equiposYaAsignados: plan.skipped.map(summary),
        })),
        juradosCubiertos: covered.map((juror) => ({
          id: juror.id,
          nombre: fullName(juror),
          equiposCubiertos: assignable.filter((team) =>
            this.hasJuror(team, juror.id),
          ).length,
        })),
        juradosSinGrupos: covered
          .filter(
            (juror) => !teams.some((team) => this.hasJuror(team, juror.id)),
          )
          .map((juror) => ({ id: juror.id, nombre: fullName(juror) })),
        equiposNoAsignables: notAssignable.map(({ team, code }) => ({
          ...summary(team),
          motivo: code,
        })),
        totales: {
          equiposCubiertos: assignable.length,
          asignacionesAgregadas: added,
          asignacionesOmitidas: skipped,
        },
        advertenciasAceptadas: acceptedWarnings,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Error al asignar suplentes en lote:', error);
      throw new InternalServerErrorException(
        'No se pudo asignar a los suplentes. Se revirtió todo y no cambió ninguna asignación.',
      );
    }
  }

  /** Pares, bitácora y avisos en la misma transacción. Devuelve los avisos creados. */
  private async save(
    tx: Prisma.TransactionClient,
    plans: SubstitutePlan[],
    covered: Person[],
    jurorIds: string[],
    actorUserId: string,
    acceptedWarnings: AssignmentWarning[],
    edition: ActiveEdition,
  ): Promise<Array<number | null>> {
    const byTeam = new Map<number, string[]>();
    for (const plan of plans) {
      for (const team of plan.added) {
        byTeam.set(team.id, [
          ...(byTeam.get(team.id) ?? []),
          plan.substitute.id,
        ]);
      }
    }

    // `connect` agrega sin quitar a nadie: los jurados originales conservan sus grupos.
    for (const [teamId, ids] of byTeam) {
      await tx.team.update({
        where: { id: teamId },
        data: { assignedJurors: { connect: ids.map((id) => ({ id })) } },
      });
    }

    const coveredById = new Map(covered.map((juror) => [juror.id, juror]));
    for (const plan of plans) {
      for (const team of plan.added) {
        const coveredHere = jurorIds
          .filter((id) => this.hasJuror(team, id))
          .map((id) => `${fullName(coveredById.get(id)!)} (${id})`);
        await this.jurorAssignmentAuditService.create(
          {
            action: ManualJurorAssignmentAction.ASSIGN,
            actorUserId,
            teamId: team.id,
            jurorId: plan.substitute.id,
            newJurorId: plan.substitute.id,
            notes: AssignmentValidationService.auditNote(
              `${SUBSTITUTE_BULK_AUDIT_NOTE} Cubre a ${coveredHere.join(', ')}.`,
              acceptedWarnings,
            ),
          },
          tx,
        );
      }
    }

    // HU-22: un aviso por suplente con todos los grupos que recibió en esta operación.
    const noticeIds: Array<number | null> = [];
    for (const plan of plans) {
      if (plan.added.length === 0) continue;
      noticeIds.push(
        await this.substituteNotices.recordAssignment(tx, {
          jurorId: plan.substitute.id,
          teamIds: plan.added.map((team) => team.id),
          editionId: edition.id,
        }),
      );
    }
    return noticeIds;
  }

  private hasJuror(team: TargetTeam, jurorId: string): boolean {
    return team.assignedJurors.some((juror) => juror.id === jurorId);
  }

  /** Un suplente no puede cubrir sus propios grupos: se rechaza en vez de adivinar. */
  private assertDisjoint(jurorIds: string[], substituteIds: string[]) {
    const both = substituteIds.filter((id) => jurorIds.includes(id));
    if (both.length === 0) return;
    throw new BadRequestException({
      statusCode: 400,
      code: SUBSTITUTE_IS_COVERED_JUROR,
      message:
        'Un mismo usuario no puede ser jurado a cubrir y suplente en la misma operación. Quítalo de una de las dos listas.',
      ids: both,
    });
  }

  /**
   * Jurados a cubrir: cuentas activas de jurado o profesor. No se exige que sigan participando en
   * la edición (igual que al quitar, ARK-131): lo que se cubre son sus grupos de la edición activa.
   */
  private async loadCoveredJurors(jurorIds: string[]): Promise<Person[]> {
    const found = await this.prisma.user.findMany({
      where: { id: { in: jurorIds }, isActive: true, role: EVALUATOR_ROLES },
      select: { id: true, firstName: true, lastName: true },
    });
    const missing = jurorIds.filter((id) => !found.some((u) => u.id === id));
    if (missing.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: NOT_AN_EVALUATOR,
        message: `${missing.length === 1 ? 'Un jurado seleccionado no existe, está inactivo o no es jurado ni profesor' : `${missing.length} jurados seleccionados no existen, están inactivos o no son jurados ni profesores`}. No se asignó nada.`,
        jurorIds: missing,
      });
    }
    // En el orden en que llegaron.
    return jurorIds.map((id) => found.find((u) => u.id === id)!);
  }

  /** Suplentes: rol Jurado, cuenta activa y tipo Suplente confirmado en la edición activa. */
  private async loadSubstitutes(
    substituteIds: string[],
    edition: ActiveEdition,
  ): Promise<Substitute[]> {
    const found = await this.prisma.user.findMany({
      where: {
        id: { in: substituteIds },
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
    const missing = substituteIds.filter(
      (id) => !found.some((u) => u.id === id),
    );
    if (missing.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        code: NOT_A_SUBSTITUTE,
        message: `${missing.length === 1 ? 'Un usuario seleccionado no es suplente' : `${missing.length} usuarios seleccionados no son suplentes`} de «${edition.title}». Solo se asignan jurados con tipo Suplente confirmados en Jurados de la edición. No se asignó nada.`,
        substituteIds: missing,
      });
    }
    return substituteIds.map((id) => found.find((u) => u.id === id)!);
  }

  /** Grupos activos de la edición activa que tiene hoy alguno de los jurados, sin repetir. */
  private loadTargetTeams(jurorIds: string[], edition: ActiveEdition) {
    return this.prisma.team.findMany({
      where: {
        isActive: true,
        editionId: edition.id,
        assignedJurors: { some: { id: { in: jurorIds } } },
      },
      select: {
        id: true,
        teamCode: true,
        teamName: true,
        editionId: true,
        notGradable: true,
        videogame: {
          select: { videogameStatus: { select: { status: true } } },
        },
        // Mismo criterio de «jurados del grupo» que la asignación manual.
        assignedJurors: {
          where: { isActive: true, role: EVALUATOR_ROLES },
          select: { id: true },
        },
      },
      orderBy: [{ teamCode: 'asc' }, { id: 'asc' }],
    });
  }
}
