import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  JurorCategory,
  ManualJurorAssignmentAction,
  Prisma,
  Role,
} from '@prisma/client';

import { PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { JurorAssignmentAuditService } from './juror-assignment-audit.service';

type EvaluatorForValidation = {
  id: string;
  roleId: number;
  jurorCategory?: JurorCategory | null;
  role?: {
    name: string;
  } | null;
};

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

  private extractLevelFromTeamCode(teamCode?: string | null): number | null {
    if (!teamCode) return null;

    const match = teamCode.match(/^N(\d+)/i);

    if (!match || !match[1]) {
      return null;
    }

    return parseInt(match[1], 10);
  }

  private getEvaluatorLabel(evaluator: EvaluatorForValidation): string {
    if (evaluator.roleId === this.professorRoleId) {
      return 'profesor';
    }

    if (evaluator.roleId === this.jurorRoleId) {
      return evaluator.jurorCategory
        ? `jurado ${evaluator.jurorCategory.toLowerCase()}`
        : 'jurado';
    }

    return 'evaluador';
  }

  private validateEvaluatorRole(evaluator: EvaluatorForValidation) {
    const isJuror = evaluator.roleId === this.jurorRoleId;
    const isProfessor = evaluator.roleId === this.professorRoleId;

    if (!isJuror && !isProfessor) {
      throw new BadRequestException(
        'El usuario debe ser un jurado o un profesor.',
      );
    }
  }

  private validateEvaluatorCategoryForLevel(
    evaluator: EvaluatorForValidation,
    teamLevel: number,
  ) {
    this.validateEvaluatorRole(evaluator);

    // [MODIFICADO]: Se eliminó la restricción que impedía a los profesores evaluar equipos de nivel distinto a 0 (manual assignment).
    // [ANTES]: if (teamLevel !== 0) { throw new BadRequestException(...) }
    if (evaluator.roleId === this.professorRoleId) {
      return;
    }

    if (evaluator.roleId === this.jurorRoleId) {
      if (!evaluator.jurorCategory) {
        throw new BadRequestException(
          'El jurado no tiene categoría asignada (JUNIOR/SENIOR).',
        );
      }

      if (teamLevel === 0 && evaluator.jurorCategory === JurorCategory.JUNIOR) {
        throw new BadRequestException(
          'Los jurados JUNIOR no pueden ser asignados a colegios (nivel 0).',
        );
      }

      return;
    }
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

    this.validateEvaluatorRole(evaluator);

    return evaluator;
  }

  private async findActiveTeam(teamId: number) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        videogame: true,
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

    return team;
  }

  async assign(jurorId: string, teamId: number, actorUserId: string) {
    try {
      const evaluator = await this.findActiveEvaluator(jurorId);
      const team = await this.findActiveTeam(teamId);

      const teamLevel = this.extractLevelFromTeamCode(team.teamCode);

      if (teamLevel === null) {
        throw new BadRequestException(
          'No se pudo determinar el nivel del equipo. El código debe tener formato N<número>-..., por ejemplo N0-COLEGIOS-01 o N1-AYP-06.',
        );
      }

      this.validateEvaluatorCategoryForLevel(evaluator, teamLevel);

      const isAlreadyAssigned = team.assignedJurors.some(
        (juror) => juror.id === jurorId,
      );

      if (isAlreadyAssigned) {
        throw new ConflictException(
          'El evaluador ya está asignado a este equipo.',
        );
      }

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
            notes: 'Asignación manual desde módulo admin.',
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
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
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
  ) {
    try {
      if (currentJurorId === newJurorId) {
        throw new BadRequestException(
          'El jurado actual y el nuevo jurado no pueden ser el mismo.',
        );
      }

      const newEvaluator = await this.findActiveEvaluator(newJurorId);
      const team = await this.findActiveTeam(teamId);

      const isCurrentAssigned = team.assignedJurors.some(
        (juror) => juror.id === currentJurorId,
      );

      if (!isCurrentAssigned) {
        throw new NotFoundException(
          'El evaluador actual no está asignado a este equipo.',
        );
      }

      const isNewAlreadyAssigned = team.assignedJurors.some(
        (juror) => juror.id === newJurorId,
      );

      if (isNewAlreadyAssigned) {
        throw new ConflictException(
          'El nuevo evaluador ya está asignado a este equipo.',
        );
      }

      const teamLevel = this.extractLevelFromTeamCode(team.teamCode);

      if (teamLevel === null) {
        throw new BadRequestException(
          'No se pudo determinar el nivel del equipo. El código debe tener formato N<número>-...',
        );
      }

      this.validateEvaluatorCategoryForLevel(newEvaluator, teamLevel);

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
            notes: 'Reasignación manual desde módulo admin.',
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
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error('Error al reasignar jurado en equipo:', error);
      throw new InternalServerErrorException(
        'Error al reasignar jurado en equipo.',
      );
    }
  }

  async unassign(jurorId: string, teamId: number, actorUserId: string) {
    try {
      await this.findActiveEvaluator(jurorId);
      const team = await this.findActiveTeam(teamId);

      const isAssigned = team.assignedJurors.some(
        (juror) => juror.id === jurorId,
      );

      if (!isAssigned) {
        throw new NotFoundException(
          'El evaluador no está asignado a este equipo.',
        );
      }

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
            notes: 'Desasignación manual desde módulo admin.',
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
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error('Error al desasignar jurado del equipo:', error);
      throw new InternalServerErrorException(
        'Error al desasignar jurado del equipo.',
      );
    }
  }

  async unassignAll(actorUserId: string) {
    try {
      const teamsWithAssignments = await this.prisma.team.findMany({
        where: {
          isActive: true,
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
          'No hay asignaciones de evaluadores activas para eliminar.',
        );
      }

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
            notes: `Se eliminaron manualmente ${assignmentCount} asignaciones de evaluadores.`,
          },
          tx,
        );
      });

      return {
        message:
          'Todas las asignaciones de evaluadores han sido eliminadas correctamente.',
        asignacionesEliminadas: assignmentCount,
      };
    } catch (error) {
      this.logger.error(
        'Error al eliminar todas las asignaciones de evaluadores:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al eliminar todas las asignaciones de evaluadores.',
      );
    }
  }

  async unassignAllFromEvaluator(jurorId: string, actorUserId: string) {
    try {
      const evaluator = await this.findActiveEvaluator(jurorId);

      const assignedTeams = await this.prisma.team.findMany({
        where: {
          isActive: true,
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

      if (assignedTeams.length === 0) {
        return {
          message: 'El evaluador no tiene asignaciones para eliminar.',
          asignacionesEliminadas: 0,
          evaluador: {
            id: evaluator.id,
            nombre:
              `${evaluator.firstName ?? ''} ${evaluator.lastName ?? ''}`.trim(),
            email: evaluator.email,
          },
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
            notes: `Se eliminaron todas las asignaciones del evaluador ${jurorId}.`,
          },
          tx,
        );
      });

      return {
        message:
          'Todas las asignaciones del evaluador han sido eliminadas correctamente.',
        asignacionesEliminadas: assignedTeams.length,
        evaluador: {
          id: evaluator.id,
          nombre:
            `${evaluator.firstName ?? ''} ${evaluator.lastName ?? ''}`.trim(),
          email: evaluator.email,
        },
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
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

  async getEvaluationTracking(teamId?: number, jurorId?: string) {
    try {
      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
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
          videogame: {
            isNot: null,
          },
        },
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
          nivel: this.extractLevelFromTeamCode(team.teamCode),
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
