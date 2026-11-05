import { findUsersByEmailCaseInsensitive } from '../common/utils/find-user-by-email';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_EDITION_WHERE,
  findActiveEdition,
  NO_ACTIVE_EDITION_MESSAGE,
} from '../editions/active-edition';
import { resolveListEdition } from '../editions/list-edition';
import { jurorsOfEdition } from '../juror-edition/jurors-of-edition';
import { AppUser } from '../auth/jwt.strategy';
import { ROLE_IDS } from '../auth/constants/roles';
import {
  ManualJurorAssignmentAction,
  Prisma,
  Role,
  User,
} from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { PrismaService } from '../prisma/prisma.service';
import { JurorAssignmentAuditService } from './assignment-audit/juror-assignment-audit.service';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { JurorListItem } from './types/juror-list-item.type';

@Injectable()
export class JurorService {
  private readonly logger = new Logger(JurorService.name);
  private readonly JUROR_ROLE_NAME = 'Jurado';
  private readonly PROFESSOR_ROLE_NAME = 'Profesor';
  private readonly CONFIRMED_STATUS_NAME = 'CONFIRMADO';
  private jurorRoleId: number;
  private professorRoleId: number;
  private confirmedStatusId: number;

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly jurorAssignmentAuditService: JurorAssignmentAuditService,
  ) { }
  async onModuleInit() {
    this.logger.log('Initializing Juror module: Fetching Juror role id');

    try {
      const jurorRole: Role | null = await this.prisma.role.findFirst({
        where: { name: this.JUROR_ROLE_NAME, isActive: true },
      });

      if (!jurorRole) {
        this.logger.error(
          `FATAL: Configuration Error during onModuleInit - Role '${this.JUROR_ROLE_NAME}' not found. Application might not function correctly.`,
        );
        throw new InternalServerErrorException(
          `Server configuration error: Missing required role '${this.JUROR_ROLE_NAME}'.`,
        );
      }

      this.jurorRoleId = jurorRole.id;
      this.logger.log(
        `Juror role ID initialized: Juror role ID=${this.jurorRoleId}`,
      );

      // Buscar ID del rol de Profesor
      const professorRole: Role | null = await this.prisma.role.findFirst({
        where: { name: this.PROFESSOR_ROLE_NAME, isActive: true },
      });

      if (!professorRole) {
        this.logger.error(
          `FATAL: Configuration Error during onModuleInit - Role '${this.PROFESSOR_ROLE_NAME}' not found. Application might not function correctly.`,
        );
        throw new InternalServerErrorException(
          `Server configuration error: Missing required role '${this.PROFESSOR_ROLE_NAME}'.`,
        );
      }

      this.professorRoleId = professorRole.id;
      this.logger.log(
        `Professor role ID initialized: Professor role ID=${this.professorRoleId}`,
      );

      // Buscar ID del estado de videojuego "CONFIRMADO"
      const confirmedStatus = await this.prisma.videogameStatus.findUnique({
        where: { status: this.CONFIRMED_STATUS_NAME, isActive: true },
      });

      if (!confirmedStatus) {
        this.logger.error(
          `FATAL: Confirmation status '${this.CONFIRMED_STATUS_NAME}' not found.`,
        );
        throw new InternalServerErrorException(
          `Missing confirmation status '${this.CONFIRMED_STATUS_NAME}'.`,
        );
      }

      this.confirmedStatusId = confirmedStatus.id;
      this.logger.log(
        `Confirmation status ID initialized: ${this.confirmedStatusId}`,
      );
    } catch (error) {
      if (error instanceof Error)
        this.logger.error(
          `Initialization failed: ${error.message}`,
          error.stack,
        );
      throw error;
    }
  }

  private mapToJurorListItem(
    user: User,
    evaluatedNames: string[],
    unevaluatedNames: string[],
  ): JurorListItem {
    return {
      id: user.id,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email,
      confirmationStatusId: user.confirmationStatusId,
      lastSignInAt: user.lastSignInAt,
      jurorCategory: user.jurorCategory,
      jurorType: user.jurorType,
      evaluatedCount: evaluatedNames.length,
      evaluatedGameNames: evaluatedNames,
      unevaluatedCount: unevaluatedNames.length,
      unevaluatedGameNames: unevaluatedNames,
    };
  }

  /**
   * ARK-132 (BG-19): la edición de un listado de jurados y equipos (la pedida o la activa). `null`
   * si no se pidió ninguna y no hay edición activa: el listado sale vacío, sin mezclar ediciones.
   * 404 si `editionId` no existe. Va fuera de los try/catch que convierten todo en 500.
   */
  private async listEditionId(editionId?: number): Promise<number | null> {
    const edition = await resolveListEdition(this.prisma, editionId);
    return edition?.id ?? null;
  }

  /** ARK-132: evaluados y pendientes del jurado, solo en la edición activa. */
  private async getEvaluationStats(
    jurorId: string,
  ): Promise<{ evaluated: string[]; unevaluated: string[] }> {
    const [evaluated, assignedTeams] = await this.prisma.$transaction([
      this.prisma.evaluation.findMany({
        where: { jurorId, Edition: ACTIVE_EDITION_WHERE },
        select: { videogame: { select: { id: true, name: true } } },
      }),
      this.prisma.team.findMany({
        where: {
          edition: ACTIVE_EDITION_WHERE,
          assignedJurors: {
            some: { id: jurorId },
          },
          videogame: { isNot: null },
        },
        select: {
          videogame: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const assignedGames = assignedTeams
      .filter((t) => t.videogame !== null)
      .map((t) => t.videogame!);

    const evaluatedIds = new Set(evaluated.map((e) => e.videogame.id));
    const evaluatedNames = evaluated.map((e) => e.videogame.name);

    const unevaluatedNames = assignedGames
      .filter((vg) => !evaluatedIds.has(vg.id))
      .map((vg) => vg.name);

    return {
      evaluated: evaluatedNames,
      unevaluated: unevaluatedNames,
    };
  }

  async create(dto: CreateJurorDto): Promise<JurorListItem> {
    let user: User;

    try {
      user = await this.auth.registerUser({
        email: dto.email,
      });

      if (!user?.id) {
        throw new InternalServerErrorException(
          `Registration did not return a user ID for ${dto.email}`,
        );
      }
    } catch (error) {
      if (
        error instanceof ConflictException ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002')
      ) {
        throw new ConflictException(
          `Juror with email ${dto.email} already exists.`,
        );
      }

      throw new InternalServerErrorException(
        `Error during registration for ${dto.email}: ${error instanceof Error ? error.message : error
        }`,
      );
    }

    try {
      const created = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          roleId: this.jurorRoleId,
          isActive: true,
          jurorCategory: dto.jurorCategory,
          jurorType: dto.jurorType,
          lastSignInAt: null,
        },
      });

      const stats = await this.getEvaluationStats(created.id);

      return this.mapToJurorListItem(
        created,
        stats.evaluated,
        stats.unevaluated,
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Database error: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * ARK-132 (BG-19): las cuentas de jurado son globales; los conteos de evaluados y pendientes son
   * de la edición pedida o, por defecto, de la activa (sin edición activa, en cero).
   *
   * ARK-140 (BG-25): con `participating`, solo los evaluadores de esa edición según HU-25
   * (`jurorsOfEdition`: jurados Confirmados y profesores con NRC activo; sin Pendientes ni
   * Declinados), y `jurorType` es el de la edición (`jurado_edicion.tipo`). Es la lista de la
   * pantalla de asignación; Personal → Jurados sigue viendo a todos.
   */
  async findAll(
    includeInactive: boolean,
    limit: number,
    page: number,
    editionId?: number,
    participating = false,
  ): Promise<PaginatedResult<JurorListItem>> {
    const offset = (page - 1) * limit;
    // -1: sin edición activa no hay evaluaciones ni equipos que contar
    const statsEditionId = (await this.listEditionId(editionId)) ?? -1;

    // Se ha modificado esta variable para incluir tanto a jurados como a profesores en el listado
    const whereClause: Prisma.UserWhereInput = participating
      ? jurorsOfEdition(statsEditionId)
      : {
          isActive: true,
          OR: [{ roleId: this.jurorRoleId }, { roleId: this.professorRoleId }],
        };

    const [users, total, allGames] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { lastName: 'asc' },
        include: {
          evaluationsSubmitted: {
            where: { editionId: statsEditionId },
            select: { videogame: { select: { id: true, name: true } } },
          },
          jurorEditions: {
            where: { editionId: statsEditionId },
            select: { type: true },
          },
        },
      }),
      this.prisma.user.count({ where: whereClause }),
      // ARK-140: la carga cuenta todos los equipos asignados de la edición, también los de
      // profesores (antes solo los equipos que tenían algún jurado externo).
      this.prisma.team.findMany({
        where: {
          isActive: true,
          editionId: statsEditionId,
          videogame: { isNot: null },
        },
        select: {
          videogame: { select: { id: true, name: true } },
          assignedJurors: { select: { id: true } },
        },
      }),
    ]);

    const gameMap = new Map<string, string[]>();
    allGames.forEach((team) => {
      team.assignedJurors.forEach((juror) => {
        if (!gameMap.has(juror.id)) gameMap.set(juror.id, []);
        if (team.videogame) gameMap.get(juror.id)?.push(team.videogame.name);
      });
    });

    const data = users.map((user) => {
      const evaluated = user.evaluationsSubmitted.map((e) => e.videogame.name);
      const assigned = gameMap.get(user.id) || [];
      const unevaluated = assigned.filter((name) => !evaluated.includes(name));
      const item = this.mapToJurorListItem(user, evaluated, unevaluated);
      // El tipo de la edición manda (HU-25); los profesores no tienen fila y conservan el suyo.
      if (participating && user.jurorEditions[0]) {
        item.jurorType = user.jurorEditions[0].type;
      }
      return item;
    });

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
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user || user.roleId !== this.jurorRoleId || !user.isActive) {
      throw new NotFoundException('Juror not found or inactive.');
    }

    return user;
  }

  async update(id: string, dto: UpdateJurorDto): Promise<JurorListItem> {
    const juror = await this.findOne(id);

    const email = dto.email?.trim().toLowerCase();
    if (email) {
      // Any case variant owned by someone else counts; `_`/`%` are literal (C1)
      const owners = await findUsersByEmailCaseInsensitive(this.prisma, email);
      if (owners.some((owner) => owner.id !== id)) {
        throw new ConflictException('Email is already used by another user.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(email !== undefined && { email }),
        ...(dto.jurorCategory !== undefined && {
          jurorCategory: dto.jurorCategory,
        }),
        ...(dto.jurorType !== undefined && {
          jurorType: dto.jurorType,
        }),
      },
    });

    // Just in case, it's important to invalidate the cache of the current user
    this.auth.invalidateUserProfileCache(id);

    const stats = await this.getEvaluationStats(id);
    return this.mapToJurorListItem(updated, stats.evaluated, stats.unevaluated);
  }

  async remove(id: string): Promise<User> {
    const user = await this.findOne(id);
    // Borrado lógico: conserva escarapelas, verificaciones y evaluaciones.
    const deactivated = await this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    // We invalidate the cache of the user being deactivated
    this.auth.invalidateUserProfileCache(id);
    return deactivated;
  }

  /**
   * Extrae el nivel del código del equipo
   * Formato esperado: N1-AYP-06 donde N es el nivel (en este caso nivel 1)
   * @param teamCode Código del equipo
   * @returns Nivel del equipo o null si no se puede extraer
   */
  private extractLevelFromTeamCode(teamCode: string): number | null {
    // Buscar el patrón N<número> al inicio del código
    const match = teamCode.match(/^N(\d+)/i);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Filtra evaluadores que solo pueden ser asignados al nivel especificado
   * - Profesores: solo nivel 0
   * - Jurados: solo niveles > 0, y del mismo nivel
   */
  async filterEvaluatorsByLevel(
    evaluators: Map<string, number>,
    targetLevel: number,
    isProfessors: boolean,
  ): Promise<Map<string, number>> {
    const filtered = new Map<string, number>();

    // Obtener todos los equipos asignados a estos evaluadores
    const evaluatorIds = Array.from(evaluators.keys());

    if (evaluatorIds.length === 0) {
      return filtered;
    }

    const roleId = isProfessors ? this.professorRoleId : this.jurorRoleId;

    const teamsWithEvaluators = await this.prisma.team.findMany({
      where: {
        isActive: true,
        assignedJurors: {
          some: {
            id: { in: evaluatorIds },
            isActive: true,
            roleId: roleId,
          },
        },
      },
      select: {
        teamCode: true,
        assignedJurors: {
          where: {
            isActive: true,
            roleId: roleId,
          },
          select: {
            id: true,
          },
        },
      },
    });

    // Crear un mapa de evaluador -> niveles asignados
    const evaluatorLevels = new Map<string, Set<number>>();

    for (const evaluatorId of evaluatorIds) {
      evaluatorLevels.set(evaluatorId, new Set());
    }

    for (const team of teamsWithEvaluators) {
      const level = this.extractLevelFromTeamCode(team.teamCode);
      if (level !== null) {
        for (const juror of team.assignedJurors) {
          const levels = evaluatorLevels.get(juror.id);
          if (levels) {
            levels.add(level);
          }
        }
      }
    }

    // Filtrar evaluadores según las reglas
    for (const [evaluatorId, load] of evaluators.entries()) {
      const assignedLevels =
        evaluatorLevels.get(evaluatorId) || new Set<number>();

      if (isProfessors) {
        // Profesores: solo pueden tener asignaciones de nivel 0
        const hasNonZeroLevel = Array.from(assignedLevels).some((l) => l !== 0);
        if (!hasNonZeroLevel) {
          // Puede ser asignado a nivel 0
          filtered.set(evaluatorId, load);
        }
      } else {
        // Jurados: no pueden tener asignaciones de nivel 0, y solo del mismo nivel
        const hasLevelZero = assignedLevels.has(0);
        const hasOtherLevel = Array.from(assignedLevels).some(
          (l) => l !== 0 && l !== targetLevel,
        );

        if (!hasLevelZero && !hasOtherLevel) {
          // Puede ser asignado a este nivel (targetLevel)
          filtered.set(evaluatorId, load);
        }
      }
    }

    return filtered;
  }

  /**
   * ARK-132 (BG-19): jurados con sus equipos de la edición pedida o, por defecto, la activa.
   * ARK-140 (BG-25): los evaluadores son los de esa edición (`jurorsOfEdition`, la misma lista
   * que la asignación): jurados Confirmados y profesores con NRC activo.
   */
  async getEvaluatorsWithTeams(editionId?: number): Promise<any[]> {
    const listEditionId = await this.listEditionId(editionId);
    if (listEditionId === null) return [];
    const evaluatorsOfEdition = jurorsOfEdition(listEditionId);
    try {
      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          editionId: listEditionId,
          assignedJurors: { some: evaluatorsOfEdition },
        },
        include: {
          assignedJurors: {
            where: evaluatorsOfEdition,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
          videogame: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          teamName: 'asc',
        },
      });

      const evaluatorsMap = new Map<
        string,
        {
          id: string;
          nombre: string;
          tipo: string;
          email: string;
          equiposAsignados: {
            id: number;
            nombre: string;
            videojuego: string | null;
          }[];
        }
      >();

      for (const team of teams) {
        for (const juror of team.assignedJurors) {
          const existing = evaluatorsMap.get(juror.id);
          const equipo = {
            id: team.id,
            nombre: team.teamName,
            videojuego: team.videogame?.name ?? null,
          };

          if (existing) {
            existing.equiposAsignados.push(equipo);
          } else {
            evaluatorsMap.set(juror.id, {
              id: juror.id,
              nombre: `${juror.firstName} ${juror.lastName}`,
              tipo: juror.role.name,
              email: juror.email,
              equiposAsignados: [equipo],
            });
          }
        }
      }

      return Array.from(evaluatorsMap.values()).map((evaluator) => ({
        id: evaluator.id,
        nombre: evaluator.nombre,
        tipo: evaluator.tipo,
        email: evaluator.email,
        equiposAsignados: evaluator.equiposAsignados,
        cantidadEquipos: evaluator.equiposAsignados.length,
      }));
    } catch (error) {
      this.logger.error('Error al obtener evaluadores con equipos:', error);
      throw new InternalServerErrorException(
        'Error al obtener la lista de evaluadores',
      );
    }
  }

  /** ARK-132 (BG-19): solo equipos de la edición pedida o, por defecto, la activa. */
  async getTeamsWithLessThanThreeJurors(editionId?: number): Promise<any[]> {
    const listEditionId = await this.listEditionId(editionId);
    if (listEditionId === null) return [];
    try {
      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          editionId: listEditionId,
          videogame: {
            videogameStatusId: this.confirmedStatusId,
          },
        },
        select: {
          id: true,
          teamName: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          videogame: {
            select: {
              id: true,
              name: true,
            },
          },
          assignedJurors: {
            where: {
              isActive: true,
              roleId: this.jurorRoleId,
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: {
          teamName: 'asc',
        },
      });

      return teams
        .filter((team) => team.assignedJurors.length < 3)
        .map((team) => ({
          id: team.id,
          nombre: team.teamName,
          videojuego: team.videogame?.name ?? null,
          lider: {
            id: team.user.id,
            nombre: `${team.user.firstName} ${team.user.lastName}`,
            email: team.user.email,
          },
          juradosAsignados: team.assignedJurors.map((juror) => ({
            id: juror.id,
            nombre: `${juror.firstName} ${juror.lastName}`,
            email: juror.email,
          })),
          cantidadJurados: team.assignedJurors.length,
        }));
    } catch (error) {
      this.logger.error(
        'Error al obtener equipos con menos de 3 jurados:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al obtener equipos con menos de 3 jurados',
      );
    }
  }

  /** ARK-132 (BG-19): equipos del jurado en la edición pedida o, por defecto, la activa. */
  async getTeamsAssignedToJuror(
    jurorId: string,
    editionId?: number,
  ): Promise<any[]> {
    try {
      // Verificar que el jurado existe
      const juror = await this.prisma.user.findUnique({
        where: { id: jurorId },
        include: { role: true },
      });

      if (!juror || !juror.isActive) {
        throw new NotFoundException('Jurado no encontrado o inactivo');
      }

      if (juror.roleId !== this.jurorRoleId) {
        throw new BadRequestException('El usuario no es un jurado');
      }

      const listEditionId = await this.listEditionId(editionId);
      if (listEditionId === null) return [];

      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          editionId: listEditionId,
          assignedJurors: {
            some: {
              id: jurorId,
            },
          },
        },
        include: {
          videogame: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          assignedJurors: {
            where: { isActive: true },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      return teams.map((team) => ({
        id: team.id,
        nombre: team.teamName,
        videojuego: team.videogame
          ? {
            id: team.videogame.id,
            nombre: team.videogame.name,
            descripcion: team.videogame.description,
          }
          : null,
        lider: {
          id: team.user.id,
          nombre: `${team.user.firstName} ${team.user.lastName}`,
          email: team.user.email,
        },
        juradosAsignados: team.assignedJurors.map((j) => ({
          id: j.id,
          nombre: `${j.firstName} ${j.lastName}`,
          email: j.email,
        })),
        cantidadJurados: team.assignedJurors.length,
      }));
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Error al obtener equipos asignados al jurado:', error);
      throw new InternalServerErrorException(
        'Error al obtener equipos asignados al jurado',
      );
    }
  }

  async removeJurorFromTeam(
    jurorId: string,
    teamId: number,
    actorUserId: string,
  ): Promise<any> {
    try {
      // Verificar que el usuario (jurado o profesor) existe y está activo
      const evaluator = await this.prisma.user.findUnique({
        where: { id: jurorId },
        include: { role: true },
      });

      if (!evaluator || !evaluator.isActive) {
        throw new NotFoundException(
          'Evaluador (jurado o profesor) no encontrado o inactivo',
        );
      }

      // Validar que sea jurado o profesor
      if (
        evaluator.roleId !== this.jurorRoleId &&
        evaluator.roleId !== this.professorRoleId
      ) {
        throw new BadRequestException(
          'El usuario no es un jurado ni un profesor',
        );
      }

      // Verificar que el equipo existe y está activo
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        include: {
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
            },
          },
        },
      });

      if (!team || !team.isActive) {
        throw new NotFoundException('Equipo no encontrado o inactivo');
      }

      // Verificar que el evaluador está asignado al equipo
      const isAssigned = team.assignedJurors.some((j) => j.id === jurorId);
      if (!isAssigned) {
        throw new NotFoundException(
          'El evaluador (jurado o profesor) no está asignado a este equipo',
        );
      }

      // Eliminar la asignación + registrar auditoría
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
            notes: 'Desasignación manual desde módulo admin',
          },
          tx,
        );

        const teamUpdated = await tx.team.findUnique({
          where: { id: teamId },
          include: {
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
            videogame: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        return teamUpdated;
      });

      if (!updatedTeam) {
        throw new NotFoundException(
          'Equipo no encontrado después de la desasignación',
        );
      }

      this.logger.log(
        `Se eliminó la asignación del evaluador ${jurorId} del equipo ${teamId}`,
      );

      return {
        message:
          'Evaluador (jurado o profesor) desasignado correctamente del equipo',
        equipo: {
          id: updatedTeam.id,
          nombre: updatedTeam.teamName,
          videojuego: updatedTeam.videogame?.name || null,
          juradosAsignados: updatedTeam.assignedJurors.map((j) => ({
            id: j.id,
            nombre: `${j.firstName} ${j.lastName}`,
            email: j.email,
          })),
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
        'Error al desasignar jurado del equipo',
      );
    }
  }

  async getTeamEvaluationStats(teamId: number): Promise<{
    totalJurorsAssigned: number;
    jurorsWhoEvaluated: number;
  }> {
    try {
      // Obtener el equipo con sus jurados asignados y su videojuego
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: {
          id: true,
          videogame: {
            select: {
              id: true,
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
            },
          },
        },
      });

      if (!team) {
        throw new NotFoundException('Equipo no encontrado');
      }

      if (!team.videogame) {
        return {
          totalJurorsAssigned: team.assignedJurors.length,
          jurorsWhoEvaluated: 0,
        };
      }

      const assignedJurorIds = team.assignedJurors.map((j) => j.id);

      // Contar evaluaciones realizadas por los jurados asignados para este videojuego
      const evaluationsCount = await this.prisma.evaluation.count({
        where: {
          videogameId: team.videogame.id,
          jurorId: { in: assignedJurorIds },
          isActive: true,
        },
      });

      return {
        totalJurorsAssigned: team.assignedJurors.length,
        jurorsWhoEvaluated: evaluationsCount,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        'Error al obtener estadísticas de evaluación del equipo:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al obtener estadísticas de evaluación del equipo',
      );
    }
  }
  /**
   * ARK-110: el correo del jurado solo se incluye si `includeEmail` (el controlador lo
   * activa únicamente para el Administrador). La ruta exige `ListJurors`, que hoy solo
   * tiene el Administrador; el filtro evita exponer correos si el permiso se amplía.
   */
  async getTeamJurorsEvaluationStatus(
    teamId: number,
    includeEmail = false,
  ): Promise<any> {
    const toJuror = (
      juror: { id: string; firstName: string; lastName: string; email: string },
      yaCalifico: boolean,
    ) => ({
      id: juror.id,
      nombre: `${juror.firstName} ${juror.lastName}`,
      ...(includeEmail ? { email: juror.email } : {}),
      yaCalifico,
      estadoEvaluacion: yaCalifico ? 'CALIFICADO' : 'PENDIENTE',
    });

    try {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: {
          id: true,
          teamName: true,
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

      if (!team) {
        throw new NotFoundException('Equipo no encontrado');
      }

      if (!team.videogame) {
        return {
          equipo: {
            id: team.id,
            nombre: team.teamName,
            videojuego: null,
          },
          jurados: team.assignedJurors.map((juror) => toJuror(juror, false)),
        };
      }

      const evaluations = await this.prisma.evaluation.findMany({
        where: {
          videogameId: team.videogame.id,
          jurorId: {
            in: team.assignedJurors.map((juror) => juror.id),
          },
          isActive: true,
        },
        select: {
          jurorId: true,
        },
      });

      const jurorsWhoEvaluated = new Set(
        evaluations.map((evaluation) => evaluation.jurorId),
      );

      return {
        equipo: {
          id: team.id,
          nombre: team.teamName,
          videojuego: team.videogame.name,
        },
        jurados: team.assignedJurors.map((juror) =>
          toJuror(juror, jurorsWhoEvaluated.has(juror.id)),
        ),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        'Error al obtener estado de evaluación de jurados del equipo:',
        error,
      );

      throw new InternalServerErrorException(
        'Error al obtener estado de evaluación de jurados del equipo',
      );
    }
  }

  /**
   * BG-01: `ViewTeamEvaluationStats` lo tienen estudiantes, profesores y jurados.
   * Un estudiante solo puede consultar las estadísticas de SU equipo (donde es
   * líder); el resto de roles con el permiso pueden consultar cualquier equipo.
   * Si el equipo no existe o no es suyo, responde 403 para no revelar su existencia.
   */
  async assertCanViewTeamEvaluationStats(
    user: AppUser,
    teamId: number,
  ): Promise<void> {
    if (user.roleId !== ROLE_IDS.STUDENT) return;

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { userId: true },
    });

    if (!team || team.userId !== user.id) {
      throw new ForbiddenException(
        'You do not have permission to access this resource.',
      );
    }
  }
}
