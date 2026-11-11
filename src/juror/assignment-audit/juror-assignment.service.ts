import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  ActiveEdition,
  requireActiveEdition,
} from '../../editions/active-edition';
import { jurorsOfEdition } from '../../juror-edition/jurors-of-edition';
import {
  JurorCategory,
  ManualJurorAssignmentAction,
  Prisma,
  Role,
} from '@prisma/client';

import { PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { JurorAssignmentAuditService } from './juror-assignment-audit.service';
import {
  extractTeamLevel,
  findTeamEditionBlocker,
} from '../assignment-validation/assignment-rules';
import {
  AssignmentChange,
  RuleEvaluator,
  RuleTeam,
} from '../assignment-validation/assignment-rules.types';
import { AssignmentValidationService } from '../assignment-validation/assignment-validation.service';
import { resolveListEdition } from '../../editions/list-edition';
import { AssignmentPushNotifier } from '../../push-notifications/assignment-push-notifier.service';
import { CONFIRMED_TEAM } from '../../teams/team-status';
import { findTeamNotConfirmedBlocker } from '../assignment-validation/assignment-rules';

type EvaluatorForValidation = {
  id: string;
  roleId: number;
  jurorCategory?: JurorCategory | null;
  firstName?: string | null;
  lastName?: string | null;
  /** ARK-131: si participa en la edición activa (solo se calcula para quien se agrega). */
  participatesInActiveEdition?: boolean;
};

type TeamForValidation = {
  id: number;
  teamCode: string;
  editionId: number;
  edition?: { title: string | null } | null;
  assignedJurors: Array<{ id: string }>;
};

/**
 * ARK-133: la bitácora no tiene columna de edición, así que la edición va al inicio de `notes`
 * con un formato fijo («Edición «Feria 5» (id 5)») para poder filtrarla después.
 */
function editionNote(edition: Pick<ActiveEdition, 'id' | 'title'>): string {
  return `Edición «${edition.title}» (id ${edition.id})`;
}

/** «1 asignación» / «3 asignaciones»: los mensajes de quitar no dicen «1 equipos». */
function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** «Se eliminó» / «Se eliminaron» según la cantidad. */
function removedVerb(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

type AuditLogFilters = {
  jurorId?: string;
  teamId?: number;
  action?: ManualJurorAssignmentAction;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
};

@Injectable()
export class JurorAssignmentService implements OnModuleInit {
  private readonly logger = new Logger(JurorAssignmentService.name);

  private readonly JUROR_ROLE_NAME = 'Jurado';
  private readonly PROFESSOR_ROLE_NAME = 'Profesor';

  private jurorRoleId: number;
  private professorRoleId: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jurorAssignmentAuditService: JurorAssignmentAuditService,
    private readonly assignmentValidation: AssignmentValidationService,
    // HU-37: se llama después de confirmar cada transacción; no espera ni puede fallar.
    private readonly pushNotifier: AssignmentPushNotifier,
  ) {}

  async onModuleInit() {
    const jurorRole: Role | null = await this.prisma.role.findFirst({
      where: {
        name: this.JUROR_ROLE_NAME,
        isActive: true,
      },
    });

    if (!jurorRole) {
      throw new InternalServerErrorException(
        `Falta el rol requerido '${this.JUROR_ROLE_NAME}' en la base de datos.`,
      );
    }

    const professorRole: Role | null = await this.prisma.role.findFirst({
      where: {
        name: this.PROFESSOR_ROLE_NAME,
        isActive: true,
      },
    });

    if (!professorRole) {
      throw new InternalServerErrorException(
        `Falta el rol requerido '${this.PROFESSOR_ROLE_NAME}' en la base de datos.`,
      );
    }

    this.jurorRoleId = jurorRole.id;
    this.professorRoleId = professorRole.id;

    this.logger.log(
      `JurorAssignmentService inicializado. JurorRoleId=${this.jurorRoleId}, ProfessorRoleId=${this.professorRoleId}`,
    );
  }

  /** Traduce el usuario al formato de las reglas de HU-08. */
  private toRuleEvaluator(evaluator: EvaluatorForValidation): RuleEvaluator {
    const kind =
      evaluator.roleId === this.professorRoleId
        ? 'PROFESSOR'
        : evaluator.roleId === this.jurorRoleId
          ? 'JUROR'
          : 'OTHER';

    return {
      id: evaluator.id,
      name: `${evaluator.firstName ?? ''} ${evaluator.lastName ?? ''}`.trim(),
      kind,
      jurorCategory: evaluator.jurorCategory ?? null,
      participatesInActiveEdition: evaluator.participatesInActiveEdition,
    };
  }

  private toRuleTeam(team: TeamForValidation): RuleTeam {
    return {
      id: team.id,
      teamCode: team.teamCode,
      editionId: team.editionId,
      editionTitle: team.edition?.title ?? null,
      jurorIds: team.assignedJurors.map((juror) => juror.id),
    };
  }

  /**
   * HU-08: valida con el servicio centralizado. Lanza los bloqueos y, si hay
   * advertencias sin confirmar, un 409 ASSIGNMENT_WARNINGS. Devuelve las
   * advertencias aceptadas.
   */
  private async validateChanges(
    activeEdition: ActiveEdition,
    team: TeamForValidation,
    evaluators: EvaluatorForValidation[],
    changes: AssignmentChange[],
    confirmWarnings: boolean,
  ) {
    const result = await this.assignmentValidation.validate({
      activeEdition: { id: activeEdition.id, title: activeEdition.title },
      teams: [this.toRuleTeam(team)],
      evaluators: evaluators.map((evaluator) =>
        this.toRuleEvaluator(evaluator),
      ),
      changes,
    });

    return this.assignmentValidation.enforce(result, confirmWarnings);
  }

  private formatAssignedJurors(
    jurors: Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    }>,
  ) {
    return jurors.map((juror) => ({
      id: juror.id,
      nombre: `${juror.firstName ?? ''} ${juror.lastName ?? ''}`.trim(),
      email: juror.email,
    }));
  }

  private async findActiveEvaluator(evaluatorId: string) {
    const evaluator = await this.prisma.user.findUnique({
      where: { id: evaluatorId },
      include: {
        role: true,
      },
    });

    if (!evaluator || !evaluator.isActive) {
      throw new NotFoundException('Evaluador no encontrado o inactivo.');
    }

    if (this.toRuleEvaluator(evaluator).kind === 'OTHER') {
      throw new BadRequestException(
        'El usuario debe ser un jurado o un profesor.',
      );
    }

    return evaluator;
  }

  /**
   * ARK-131 (BG-18): participa en la edición activa según HU-25 (`jurorsOfEdition`, la única
   * definición): jurado externo confirmado en la edición o profesor con un NRC activo en ella.
   */
  private async participatesInEdition(
    evaluatorId: string,
    editionId: number,
  ): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: jurorsOfEdition(editionId, [evaluatorId]),
      select: { id: true },
    });
    return !!found;
  }

  /** Evaluador activo que se agrega, con su participación en la edición activa. */
  private async findEvaluatorToAdd(
    evaluatorId: string,
    activeEdition: ActiveEdition,
  ) {
    const evaluator = await this.findActiveEvaluator(evaluatorId);
    return {
      ...evaluator,
      participatesInActiveEdition: await this.participatesInEdition(
        evaluator.id,
        activeEdition.id,
      ),
    };
  }

  /** BG-35 (ARK-158): asignar y reasignar exigen equipo confirmado; quitar no. */
  private assertTeamConfirmed(
    team: Parameters<typeof findTeamNotConfirmedBlocker>[0],
  ) {
    const blocker = findTeamNotConfirmedBlocker(team);
    if (blocker) {
      this.assignmentValidation.enforce({ blockers: [blocker], warnings: [] });
    }
  }

  private async findActiveTeam(teamId: number, activeEdition: ActiveEdition) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        videogame: { include: { videogameStatus: { select: { status: true } } } },
        edition: { select: { status: true, title: true } },
        assignedJurors: {
          where: {
            isActive: true,
            OR: [
              { roleId: this.jurorRoleId },
              { roleId: this.professorRoleId },
            ],
          },
          select: {
            id: true,
            roleId: true,
            jurorCategory: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!team || !team.isActive) {
      throw new NotFoundException('Equipo no encontrado o inactivo.');
    }

    // ARK-130/131: asignar, reasignar y quitar solo en equipos de la edición activa. Es la
    // misma regla de HU-08 (bloqueo TEAM_NOT_IN_ACTIVE_EDITION); se revisa aquí primero para
    // que el 400 llegue antes que los 404 de «no está asignado».
    const editionBlocker = findTeamEditionBlocker(
      { ...team, editionTitle: team.edition?.title ?? null },
      activeEdition,
    );
    if (editionBlocker) {
      this.assignmentValidation.enforce({
        blockers: [editionBlocker],
        warnings: [],
      });
    }

    return team;
  }

  async assign(
    jurorId: string,
    teamId: number,
    actorUserId: string,
    confirmWarnings = false,
  ) {
    try {
      const activeEdition = await requireActiveEdition(this.prisma);
      const evaluator = await this.findEvaluatorToAdd(jurorId, activeEdition);
      const team = await this.findActiveTeam(teamId, activeEdition);
      this.assertTeamConfirmed(team);

      const acceptedWarnings = await this.validateChanges(
        activeEdition,
        team,
        [evaluator],
        [{ type: 'ADD', jurorId, teamId }],
        confirmWarnings,
      );

      const updatedTeam = await this.prisma.$transaction(async (tx) => {
        await tx.team.update({
          where: { id: teamId },
          data: {
            assignedJurors: {
              connect: {
                id: jurorId,
              },
            },
          },
        });

        await this.jurorAssignmentAuditService.create(
          {
            action: ManualJurorAssignmentAction.ASSIGN,
            actorUserId,
            teamId,
            jurorId,
            newJurorId: jurorId,
            notes: AssignmentValidationService.auditNote(
              'Asignación manual desde módulo admin.',
              acceptedWarnings,
            ),
          },
          tx,
        );

        return tx.team.findUnique({
          where: { id: teamId },
          include: {
            videogame: {
              select: {
                id: true,
                name: true,
              },
            },
            assignedJurors: {
              where: {
                isActive: true,
                OR: [
                  { roleId: this.jurorRoleId },
                  { roleId: this.professorRoleId },
                ],
              },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });
      });

      if (!updatedTeam) {
        throw new NotFoundException(
          'Equipo no encontrado después de la asignación.',
        );
      }

      this.pushNotifier.notifyAssignmentChanged([jurorId]);

      return {
        message: 'Jurado asignado correctamente al equipo.',
        equipo: {
          id: updatedTeam.id,
          nombre: updatedTeam.teamName,
          videojuego: updatedTeam.videogame?.name ?? null,
          juradosAsignados: this.formatAssignedJurors(
            updatedTeam.assignedJurors,
          ),
          cantidadJurados: updatedTeam.assignedJurors.length,
        },
        advertenciasAceptadas: acceptedWarnings,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Error al asignar jurado a equipo:', error);
      throw new InternalServerErrorException(
        'Error al asignar jurado al equipo.',
      );
    }
  }

  async reassign(
    currentJurorId: string,
    newJurorId: string,
    teamId: number,
    actorUserId: string,
    confirmWarnings = false,
  ) {
    try {
      if (currentJurorId === newJurorId) {
        throw new BadRequestException(
          'El jurado actual y el nuevo jurado no pueden ser el mismo.',
        );
      }

      const activeEdition = await requireActiveEdition(this.prisma);
      const newEvaluator = await this.findEvaluatorToAdd(
        newJurorId,
        activeEdition,
      );
      const team = await this.findActiveTeam(teamId, activeEdition);
      this.assertTeamConfirmed(team);

      const isCurrentAssigned = team.assignedJurors.some(
        (juror) => juror.id === currentJurorId,
      );

      if (!isCurrentAssigned) {
        throw new NotFoundException(
          'El evaluador actual no está asignado a este equipo.',
        );
      }

      // Reasignar = quitar al actual y agregar al nuevo (bloqueos y advertencias de HU-08).
      const acceptedWarnings = await this.validateChanges(
        activeEdition,
        team,
        [newEvaluator],
        [
          { type: 'REMOVE', jurorId: currentJurorId, teamId },
          { type: 'ADD', jurorId: newJurorId, teamId },
        ],
        confirmWarnings,
      );

      const updatedTeam = await this.prisma.$transaction(async (tx) => {
        await tx.team.update({
          where: { id: teamId },
          data: {
            assignedJurors: {
              disconnect: {
                id: currentJurorId,
              },
            },
          },
        });

        await tx.team.update({
          where: { id: teamId },
          data: {
            assignedJurors: {
              connect: {
                id: newJurorId,
              },
            },
          },
        });

        await this.jurorAssignmentAuditService.create(
          {
            action: ManualJurorAssignmentAction.REASSIGN,
            actorUserId,
            teamId,
            jurorId: newJurorId,
            previousJurorId: currentJurorId,
            newJurorId,
            notes: AssignmentValidationService.auditNote(
              'Reasignación manual desde módulo admin.',
              acceptedWarnings,
            ),
          },
          tx,
        );

        return tx.team.findUnique({
          where: { id: teamId },
          include: {
            videogame: {
              select: {
                id: true,
                name: true,
              },
            },
            assignedJurors: {
              where: {
                isActive: true,
                OR: [
                  { roleId: this.jurorRoleId },
                  { roleId: this.professorRoleId },
                ],
              },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });
      });

      if (!updatedTeam) {
        throw new NotFoundException(
          'Equipo no encontrado después de la reasignación.',
        );
      }

      this.pushNotifier.notifyAssignmentChanged([currentJurorId, newJurorId]);

      return {
        message: 'Evaluador reasignado correctamente.',
        equipo: {
          id: updatedTeam.id,
          nombre: updatedTeam.teamName,
          videojuego: updatedTeam.videogame?.name ?? null,
          juradosAsignados: this.formatAssignedJurors(
            updatedTeam.assignedJurors,
          ),
          cantidadJurados: updatedTeam.assignedJurors.length,
        },
        advertenciasAceptadas: acceptedWarnings,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Error al reasignar jurado en equipo:', error);
      throw new InternalServerErrorException(
        'Error al reasignar jurado en equipo.',
      );
    }
  }

  async unassign(
    jurorId: string,
    teamId: number,
    actorUserId: string,
    confirmWarnings = false,
  ) {
    try {
      // Quitar no exige que el evaluador participe en la edición (ARK-131): un jurado que
      // dejó de participar (declinó, perdió su NRC) se debe poder retirar de sus grupos.
      const activeEdition = await requireActiveEdition(this.prisma);
      await this.findActiveEvaluator(jurorId);
      const team = await this.findActiveTeam(teamId, activeEdition);

      const isAssigned = team.assignedJurors.some(
        (juror) => juror.id === jurorId,
      );

      if (!isAssigned) {
        throw new NotFoundException(
          'El evaluador no está asignado a este equipo.',
        );
      }

      // HU-08: advierte si el grupo queda con menos jurados que el mínimo.
      const acceptedWarnings = await this.validateChanges(
        activeEdition,
        team,
        [],
        [{ type: 'REMOVE', jurorId, teamId }],
        confirmWarnings,
      );

      const updatedTeam = await this.prisma.$transaction(async (tx) => {
        await tx.team.update({
          where: { id: teamId },
          data: {
            assignedJurors: {
              disconnect: {
                id: jurorId,
              },
            },
          },
        });

        await this.jurorAssignmentAuditService.create(
          {
            action: ManualJurorAssignmentAction.UNASSIGN,
            actorUserId,
            teamId,
            jurorId,
            previousJurorId: jurorId,
            notes: AssignmentValidationService.auditNote(
              'Desasignación manual desde módulo admin.',
              acceptedWarnings,
            ),
          },
          tx,
        );

        return tx.team.findUnique({
          where: { id: teamId },
          include: {
            videogame: {
              select: {
                id: true,
                name: true,
              },
            },
            assignedJurors: {
              where: {
                isActive: true,
                OR: [
                  { roleId: this.jurorRoleId },
                  { roleId: this.professorRoleId },
                ],
              },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });
      });

      if (!updatedTeam) {
        throw new NotFoundException(
          'Equipo no encontrado después de la desasignación.',
        );
      }

      this.pushNotifier.notifyAssignmentChanged([jurorId]);

      return {
        message: 'Evaluador desasignado correctamente del equipo.',
        equipo: {
          id: updatedTeam.id,
          nombre: updatedTeam.teamName,
          videojuego: updatedTeam.videogame?.name ?? null,
          juradosAsignados: this.formatAssignedJurors(
            updatedTeam.assignedJurors,
          ),
          cantidadJurados: updatedTeam.assignedJurors.length,
        },
        advertenciasAceptadas: acceptedWarnings,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Error al desasignar jurado del equipo:', error);
      throw new InternalServerErrorException(
        'Error al desasignar jurado del equipo.',
      );
    }
  }

  /**
   * ARK-133 (BG-20): «quitar todas» solo toca equipos de la edición activa. Las asignaciones de
   * ediciones anteriores son historial (reportes, seguimiento, certificados) y no se borran.
   */
  async unassignAll(actorUserId: string) {
    // Fuera del try: sin edición activa es un 404 claro, no un 500
    const edition = await requireActiveEdition(this.prisma);

    try {
      const teamsWithAssignments = await this.prisma.team.findMany({
        where: {
          isActive: true,
          editionId: edition.id,
          assignedJurors: {
            some: {
              OR: [
                { roleId: this.jurorRoleId },
                { roleId: this.professorRoleId },
              ],
            },
          },
        },
        include: {
          assignedJurors: {
            where: {
              OR: [
                { roleId: this.jurorRoleId },
                { roleId: this.professorRoleId },
              ],
            },
            select: {
              id: true,
            },
          },
        },
      });

      const assignmentCount = teamsWithAssignments.reduce(
        (total, team) => total + team.assignedJurors.length,
        0,
      );

      if (assignmentCount === 0) {
        throw new BadRequestException(
          `No hay asignaciones de evaluadores en «${edition.title}» para eliminar.`,
        );
      }

      const teamCount = teamsWithAssignments.length;

      await this.prisma.$transaction(async (tx) => {
        for (const team of teamsWithAssignments) {
          await tx.team.update({
            where: { id: team.id },
            data: {
              assignedJurors: {
                set: [],
              },
            },
          });
        }

        await this.jurorAssignmentAuditService.create(
          {
            action: ManualJurorAssignmentAction.UNASSIGN_ALL,
            actorUserId,
            notes: `${editionNote(edition)}: ${removedVerb(assignmentCount, 'se eliminó', 'se eliminaron')} manualmente ${count(assignmentCount, 'asignación', 'asignaciones')} de evaluadores en ${count(teamCount, 'equipo', 'equipos')}.`,
          },
          tx,
        );
      });

      this.pushNotifier.notifyAssignmentChanged(
        teamsWithAssignments.flatMap((team) =>
          team.assignedJurors.map((juror) => juror.id),
        ),
      );

      return {
        message: `${removedVerb(assignmentCount, 'Se eliminó', 'Se eliminaron')} ${count(assignmentCount, 'asignación', 'asignaciones')} de evaluadores en ${count(teamCount, 'equipo', 'equipos')} de «${edition.title}».`,
        asignacionesEliminadas: assignmentCount,
        equiposAfectados: teamCount,
        edicion: { id: edition.id, title: edition.title },
      };
    } catch (error) {
      // El 400 de «no hay asignaciones» llegaba al front como 500
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        'Error al eliminar todas las asignaciones de evaluadores:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al eliminar todas las asignaciones de evaluadores.',
      );
    }
  }

  /** ARK-133 (BG-20): solo quita al evaluador de los equipos de la edición activa. */
  async unassignAllFromEvaluator(jurorId: string, actorUserId: string) {
    try {
      const evaluator = await this.findActiveEvaluator(jurorId);
      const edition = await requireActiveEdition(this.prisma);

      const assignedTeams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          editionId: edition.id,
          assignedJurors: {
            some: {
              id: jurorId,
            },
          },
        },
        select: {
          id: true,
        },
      });

      const evaluatorInfo = {
        id: evaluator.id,
        nombre:
          `${evaluator.firstName ?? ''} ${evaluator.lastName ?? ''}`.trim(),
        email: evaluator.email,
      };
      const editionInfo = { id: edition.id, title: edition.title };

      if (assignedTeams.length === 0) {
        return {
          message: `El evaluador no tiene asignaciones en «${edition.title}» para eliminar.`,
          asignacionesEliminadas: 0,
          evaluador: evaluatorInfo,
          edicion: editionInfo,
        };
      }

      await this.prisma.$transaction(async (tx) => {
        for (const team of assignedTeams) {
          await tx.team.update({
            where: { id: team.id },
            data: {
              assignedJurors: {
                disconnect: {
                  id: jurorId,
                },
              },
            },
          });
        }

        await this.jurorAssignmentAuditService.create(
          {
            action: ManualJurorAssignmentAction.UNASSIGN_ALL_FROM_EVALUATOR,
            actorUserId,
            jurorId,
            previousJurorId: jurorId,
            notes: `${editionNote(edition)}: ${removedVerb(assignedTeams.length, 'se eliminó', 'se eliminaron')} ${count(assignedTeams.length, 'asignación', 'asignaciones')} del evaluador ${jurorId}.`,
          },
          tx,
        );
      });

      this.pushNotifier.notifyAssignmentChanged([jurorId]);

      return {
        message: `${removedVerb(assignedTeams.length, 'Se quitó', 'Se quitaron')} ${count(assignedTeams.length, 'equipo', 'equipos')} de «${edition.title}» al evaluador.`,
        asignacionesEliminadas: assignedTeams.length,
        evaluador: evaluatorInfo,
        edicion: editionInfo,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        'Error al eliminar todas las asignaciones del evaluador:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al eliminar todas las asignaciones del evaluador.',
      );
    }
  }

  async getAuditLog(filters: AuditLogFilters): Promise<PaginatedResult<any>> {
    try {
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 20;
      const skip = (page - 1) * limit;

      const where: Prisma.JurorAssignmentAuditLogWhereInput = {};

      if (filters.jurorId) {
        where.OR = [
          { jurorId: filters.jurorId },
          { previousJurorId: filters.jurorId },
          { newJurorId: filters.jurorId },
        ];
      }

      if (filters.teamId) {
        where.teamId = filters.teamId;
      }

      if (filters.action) {
        where.action = filters.action;
      }

      if (filters.actorUserId) {
        where.actorUserId = filters.actorUserId;
      }

      if (filters.from || filters.to) {
        where.createdAt = {};

        if (filters.from) {
          where.createdAt.gte = filters.from;
        }

        if (filters.to) {
          where.createdAt.lte = filters.to;
        }
      }

      const [data, total] = await this.prisma.$transaction([
        this.prisma.jurorAssignmentAuditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
        }),
        this.prisma.jurorAssignmentAuditLog.count({
          where,
        }),
      ]);

      return {
        data,
        metadata: {
          totalItems: total,
          itemsOnCurrentPage: data.length,
          currentPage: page,
          itemsPerPage: limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('Error al obtener log de auditoría:', error);
      throw new InternalServerErrorException(
        'Error al obtener log de auditoría de asignaciones.',
      );
    }
  }

  /**
   * ARK-132 (BG-19): alimenta la pantalla Asignación de jurados. Solo equipos de la edición
   * pedida o, por defecto, la activa (sin edición activa, lista vacía). La edición se resuelve
   * fuera del try para que el 404 de una edición inexistente no se vuelva 500.
   */
  async getEvaluationTracking(teamId?: number, jurorId?: string, editionId?: number) {
    const edition = await resolveListEdition(this.prisma, editionId);
    if (!edition) {
      if (teamId) throw new NotFoundException('Equipo no encontrado o sin videojuego.');
      return [];
    }

    try {
      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          editionId: edition.id,
          ...(teamId ? { id: teamId } : {}),
          ...(jurorId
            ? {
                assignedJurors: {
                  some: {
                    id: jurorId,
                  },
                },
              }
            : {}),
          // BG-35 (ARK-158): solo equipos confirmados en la pantalla de asignación.
          ...CONFIRMED_TEAM,
        },
        include: {
          videogame: {
            select: {
              id: true,
              name: true,
            },
          },
          // ARK-140 (BG-25): el líder del equipo es `team.userId` (ARK-128).
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          assignedJurors: {
            where: {
              isActive: true,
              OR: [
                { roleId: this.jurorRoleId },
                { roleId: this.professorRoleId },
              ],
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              roleId: true,
              jurorCategory: true,
            },
          },
        },
        orderBy: {
          teamName: 'asc',
        },
      });

      if (teamId && teams.length === 0) {
        throw new NotFoundException('Equipo no encontrado o sin videojuego.');
      }

      const videogameIds = teams
        .map((team) => team.videogame?.id)
        .filter((id): id is number => typeof id === 'number');

      const assignedJurorIds = Array.from(
        new Set(
          teams.flatMap((team) => team.assignedJurors.map((juror) => juror.id)),
        ),
      );

      const evaluations =
        videogameIds.length > 0 && assignedJurorIds.length > 0
          ? await this.prisma.evaluation.findMany({
              where: {
                isActive: true,
                videogameId: {
                  in: videogameIds,
                },
                jurorId: {
                  in: assignedJurorIds,
                },
              },
              select: {
                videogameId: true,
                jurorId: true,
              },
            })
          : [];

      const evaluatedSet = new Set(
        evaluations.map(
          (evaluation) => `${evaluation.videogameId}:${evaluation.jurorId}`,
        ),
      );

      return teams.map((team) => {
        const videogameId = team.videogame?.id ?? null;

        const jurados = team.assignedJurors.map((juror) => {
          const haEvaluado = videogameId
            ? evaluatedSet.has(`${videogameId}:${juror.id}`)
            : false;

          return {
            id: juror.id,
            nombre: `${juror.firstName ?? ''} ${juror.lastName ?? ''}`.trim(),
            email: juror.email,
            categoria:
              juror.roleId === this.professorRoleId
                ? 'PROFESOR'
                : (juror.jurorCategory ?? 'SIN_CATEGORIA'),
            haEvaluado,
          };
        });

        const juradosQueEvaluaron = jurados.filter(
          (juror) => juror.haEvaluado,
        ).length;

        return {
          teamId: team.id,
          teamName: team.teamName,
          teamCode: team.teamCode,
          videojuego: team.videogame?.name ?? null,
          nivel: extractTeamLevel(team.teamCode),
          lider: team.user
            ? {
                id: team.user.id,
                nombre:
                  `${team.user.firstName ?? ''} ${team.user.lastName ?? ''}`.trim(),
                email: team.user.email,
              }
            : null,
          totalJuradosAsignados: jurados.length,
          juradosQueEvaluaron,
          // [MODIFICADO]: Se ajustó el cálculo a 3 - juradosQueEvaluaron para reflejar que siempre se requieren 3 evaluaciones en total, independientemente de cuántos jurados estén asignados.
          // [ANTES]: juradosPendientes se calculaba con jurados.length - juradosQueEvaluaron, causando valores erróneos si había menos de 3 jurados asignados.
          juradosPendientes: 3 - juradosQueEvaluaron,
          jurados,
        };
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error('Error al obtener seguimiento de evaluaciones:', error);
      throw new InternalServerErrorException(
        'Error al obtener seguimiento de evaluaciones.',
      );
    }
  }
}
