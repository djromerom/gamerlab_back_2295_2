import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  Inject,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service'; //En este video aprenderemos a conectar el back con el front como unos capos, vamos
import { Prisma, User, Role } from '@prisma/client';
import { PaginatedResult } from '../common/types/paginated-result.type';
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
      evaluatedCount: evaluatedNames.length,
      evaluatedGameNames: evaluatedNames,
      unevaluatedCount: unevaluatedNames.length,
      unevaluatedGameNames: unevaluatedNames,
    };
  }

  private async getEvaluationStats(
    jurorId: string,
  ): Promise<{ evaluated: string[]; unevaluated: string[] }> {
    const [evaluated, assignedTeams] = await this.prisma.$transaction([
      this.prisma.evaluation.findMany({
        where: { jurorId },
        select: { videogame: { select: { id: true, name: true } } },
      }),
      this.prisma.team.findMany({
        where: {
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
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Juror with email ${dto.email} already exists.`,
        );
      }
      throw new InternalServerErrorException(
        `Error during registration for ${dto.email}: ${error instanceof Error ? error.message : error}`,
      );
    }

    try {
      // Update the user with juror-specific details and make them active
      const created = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          roleId: this.jurorRoleId,
          isActive: true,
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

  async findAll(
    includeInactive: boolean,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<JurorListItem>> {
    const offset = (page - 1) * limit;

    const whereClause: Prisma.UserWhereInput = {
      roleId: this.jurorRoleId,
      isActive: true,
    };

    const [users, total, allGames] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { lastName: 'asc' },
        include: {
          evaluationsSubmitted: {
            select: { videogame: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.user.count({ where: whereClause }),
      this.prisma.team.findMany({
        where: {
          assignedJurors: { some: { roleId: this.jurorRoleId } },
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
      return this.mapToJurorListItem(user, evaluated, unevaluated);
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

    if (dto.email) {
      const emailOwner = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (emailOwner && emailOwner.id !== id) {
        throw new ConflictException('Email is already used by another user.');
      }
    }

    const updated = await this.prisma.user.update({ where: { id }, data: dto });

    // Just in case, it's important to invalidate the cache of the current user
    this.auth.invalidateUserProfileCache(id);

    const stats = await this.getEvaluationStats(id);
    return this.mapToJurorListItem(updated, stats.evaluated, stats.unevaluated);
  }

  async remove(id: string): Promise<User> {
    const user = await this.findOne(id);
    // We invalidate the cache of the user being deleted
    this.auth.invalidateUserProfileCache(id);
    return this.prisma.user.delete({
      where: { id: user.id },
    });
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

  async getTeams() {
    try {
      // Obtener TODOS los equipos activos con videojuegos confirmados
      // Esto incluye todos los niveles (0, 1, 2, 3, 4, etc.)
      const allTeams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          videogame: {
            videogameStatusId: this.confirmedStatusId,
          },
        },
        select: {
          id: true,
          teamCode: true,
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
            },
          },
          videogame: {
            select: {
              id: true,
              name: true,
              videogameStatusId: true,
            },
          },
        },
      });

      // Filtrar solo los equipos con videojuegos confirmados
      const teams = allTeams.filter(
        (team) => team.videogame?.videogameStatusId === this.confirmedStatusId,
      );

      // Contar equipos con evaluadores asignados
      const teamsWithEvaluators = teams.filter(
        (t) => t.assignedJurors.length > 0,
      ).length;
      const teamsWithoutEvaluators = teams.length - teamsWithEvaluators;

      // Agrupar por nivel para logging
      const teamsByLevel = new Map<number, number>();
      for (const team of teams) {
        if (team.teamCode) {
          const level = this.extractLevelFromTeamCode(team.teamCode);
          if (level !== null) {
            teamsByLevel.set(level, (teamsByLevel.get(level) || 0) + 1);
          }
        }
      }

      const levelSummary = Array.from(teamsByLevel.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([level, count]) => `Nivel ${level}: ${count}`)
        .join(', ');

      this.logger.log(
        `Obtenidos ${teams.length} equipos confirmados y activos para asignación ` +
        `(${teamsWithEvaluators} con evaluadores asignados, ${teamsWithoutEvaluators} sin evaluadores). ` +
        `Distribución por nivel: ${levelSummary || 'N/A'}`,
      );

      return teams;
    } catch (error) {
      this.logger.error('Error al obtener los equipos:', error);
      throw new InternalServerErrorException('Error al obtener los equipos');
    }
  }

  async getJurors(
    useProfessors: boolean = false,
  ): Promise<Map<string, number>> {
    try {
      const roleId = useProfessors ? this.professorRoleId : this.jurorRoleId;
      const roleName = useProfessors
        ? this.PROFESSOR_ROLE_NAME
        : this.JUROR_ROLE_NAME;

      const evaluators = await this.prisma.user.findMany({
        where: {
          isActive: true,
          roleId: roleId,
          email: {
            not: 'profesorcolegios@uninorte.edu.co', // Excluir este profesor específico
          },
        },
        select: {
          id: true,
          email: true,
        },
      });

      // Obtener equipos asignados a estos evaluadores para calcular la carga inicial
      const teamsWithEvaluators = await this.prisma.team.findMany({
        where: {
          isActive: true,
          assignedJurors: {
            some: {
              id: { in: evaluators.map((e) => e.id) },
              isActive: true,
              roleId: roleId,
            },
          },
        },
        select: {
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

      // Creamos el Map<evaluadorId, cantidadEvaluaciones>
      const evaluatorLoadMap = new Map<string, number>();
      for (const evaluator of evaluators) {
        evaluatorLoadMap.set(evaluator.id, 0);
      }

      // Contar asignaciones existentes
      for (const team of teamsWithEvaluators) {
        for (const juror of team.assignedJurors) {
          const currentLoad = evaluatorLoadMap.get(juror.id) || 0;
          evaluatorLoadMap.set(juror.id, currentLoad + 1);
        }
      }

      this.logger.log(
        `Obtenidos ${evaluators.length} ${roleName}${useProfessors ? 'es' : 's'} para asignación`,
      );
      return evaluatorLoadMap;
    } catch (error) {
      throw new InternalServerErrorException(
        `Error al obtener los ${useProfessors ? 'profesores' : 'jurados'}`,
      );
    }
  }

  // [MODIFICADO]: Profesores (Senior) pueden evaluar cualquier nivel
  // [ANTES]: Profesores estaban restringidos a nivel 0 únicamente
  /**
   * Filtra evaluadores que pueden ser asignados al nivel especificado
   * - Profesores (Senior): pueden evaluar cualquier nivel (N0-N4)
   * - Jurados (Junior): solo niveles > 0, y del mismo nivel
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
        // [MODIFICADO]: Profesores (Senior) pueden evaluar cualquier nivel
        // [ANTES]: Solo podían tener asignaciones de nivel 0
        filtered.set(evaluatorId, load);
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

  async getEvaluatorsWithTeams(): Promise<any[]> {
    try {
      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          assignedJurors: {
            some: {
              isActive: true,
              roleId: this.jurorRoleId,
            },
          },
        },
        include: {
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

  async assignJurorToTeam(jurorId: string, teamId: number): Promise<any> {
    try {
      // Verificar que el jurado existe y está activo
      const juror = await this.prisma.user.findUnique({
        where: { id: jurorId },
        include: { role: true },
      });

      if (!juror || !juror.isActive) {
        throw new NotFoundException('Jurado no encontrado o inactivo');
      }

      // Verificar que el equipo existe y está activo
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        include: {
          assignedJurors: true,
          videogame: true,
        },
      });

      if (!team || !team.isActive) {
        throw new NotFoundException('Equipo no encontrado o inactivo');
      }

      // Extraer el nivel del equipo al que se quiere asignar
      const teamLevel = this.extractLevelFromTeamCode(team.teamCode);
      if (teamLevel === null) {
        throw new BadRequestException(
          `No se pudo determinar el nivel del equipo. El código del equipo debe tener formato N<número>-... (ej: N1-AYP-06)`,
        );
      }

      // [MODIFICADO]: Profesores (Senior) pueden evaluar CUALQUIER nivel, no solo N0
      // [ANTES]: Profesores estaban restringidos a nivel 0 únicamente
      // Validar reglas de asignación por rol
      if (juror.roleId === this.jurorRoleId) {
        // Jurados (Junior) NO pueden ser asignados a nivel 0 (colegios)
        if (teamLevel === 0) {
          throw new BadRequestException(
            'Los jurados (Junior) no pueden ser asignados a equipos de nivel 0 (colegios). Solo los profesores (Senior) pueden evaluar colegios.',
          );
        }
      } else if (juror.roleId !== this.professorRoleId) {
        throw new BadRequestException(
          'El usuario debe ser un jurado o un profesor',
        );
      }

      // Verificar que el jurado no esté ya asignado
      const isAlreadyAssigned = team.assignedJurors.some(
        (j) => j.id === jurorId,
      );
      if (isAlreadyAssigned) {
        throw new ConflictException(
          'El evaluador ya está asignado a este equipo',
        );
      }

      // Verificar que el evaluador no tenga equipos asignados de otro nivel
      const existingTeams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          assignedJurors: {
            some: { id: jurorId },
          },
        },
        select: {
          id: true,
          teamCode: true,
        },
      });

      // [MODIFICADO]: Solo Jurados (Junior) tienen restricción de mismo nivel y de N0
      // [ANTES]: Tanto profesores como jurados estaban restringidos a un solo nivel,
      //          y profesores estaban restringidos a N0 únicamente
      // [ELIMINADO]: Restricción de profesores a solo nivel 0 y restricción de mismo nivel para profesores
      if (juror.roleId === this.jurorRoleId && existingTeams.length > 0) {
        for (const existingTeam of existingTeams) {
          const existingLevel = this.extractLevelFromTeamCode(
            existingTeam.teamCode,
          );
          if (existingLevel === null) {
            this.logger.warn(
              `No se pudo extraer el nivel del equipo existente con código: ${existingTeam.teamCode}`,
            );
            continue;
          }
          // Jurados (Junior) no pueden tener asignaciones de nivel 0
          if (existingLevel === 0) {
            throw new BadRequestException(
              'Los jurados (Junior) no pueden ser asignados a equipos de nivel 0 (colegios)',
            );
          }
          // Jurados (Junior) deben evaluar equipos del mismo nivel
          if (existingLevel !== teamLevel) {
            throw new BadRequestException(
              `El jurado ya está asignado a equipos de nivel ${existingLevel}. Solo puede evaluar equipos del mismo nivel.`,
            );
          }
        }
      }

      // Asignar el jurado al equipo en la tabla intermedia
      const updatedTeam = await this.prisma.$transaction(async (tx) => {
        try {
          await tx.$executeRaw`
            INSERT INTO "_JurorTeamAssignment" ("A", "B")
            VALUES (${teamId}, ${jurorId})
          `;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new ConflictException(
              'El jurado ya está asignado a este equipo',
            );
          }
          throw error;
        }

        const teamWithJurors = await tx.team.findUnique({
          where: { id: teamId },
          include: {
            assignedJurors: {
              where: { isActive: true },
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

        if (!teamWithJurors) {
          throw new NotFoundException(
            'Equipo no encontrado después de la asignación',
          );
        }

        return teamWithJurors;
      });

      return {
        message: 'Jurado asignado correctamente al equipo',
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
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('Error al asignar jurado a equipo:', error);
      throw new InternalServerErrorException(
        'Error al asignar jurado al equipo',
      );
    }
  }

  async getTeamsWithLessThanThreeJurors(): Promise<any[]> {
    try {
      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
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

  async getTeamsAssignedToJuror(jurorId: string): Promise<any[]> {
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

      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
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

  async removeAllJurorAssignments(): Promise<any> {
    try {
      // Obtener todos los equipos activos que tienen asignaciones de jurados/profesores
      const teamsWithAssignments = await this.prisma.team.findMany({
        where: {
          isActive: true,
          assignedJurors: {
            some: {
              isActive: true,
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

      // Contar el total de asignaciones antes de eliminarlas
      const assignmentCount = teamsWithAssignments.reduce(
        (total, team) => total + team.assignedJurors.length,
        0,
      );

      if (assignmentCount === 0) {
        return {
          message:
            'No hay asignaciones de evaluadores (jurados o profesores) para eliminar',
          asignacionesEliminadas: 0,
        };
      }

      // Eliminar todas las asignaciones usando Prisma set: [] para cada equipo
      await this.prisma.$transaction(
        teamsWithAssignments.map((team) =>
          this.prisma.team.update({
            where: { id: team.id },
            data: {
              assignedJurors: { set: [] }, // sets assignedJurors to an empty list
            },
          }),
        ),
      );

      this.logger.log(
        `Se eliminaron ${assignmentCount} asignaciones de evaluadores (jurados o profesores)`,
      );

      return {
        message:
          'Todas las asignaciones de evaluadores (jurados o profesores) han sido eliminadas correctamente',
        asignacionesEliminadas: assignmentCount,
      };
    } catch (error) {
      this.logger.error(
        'Error al eliminar todas las asignaciones de evaluadores:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al eliminar todas las asignaciones de evaluadores',
      );
    }
  }

  async removeAllAssignmentsFromJuror(jurorId: string): Promise<any> {
    try {
      // Verificar que el usuario (jurado o profesor) existe y está activo
      const evaluator = await this.prisma.user.findUnique({
        where: { id: jurorId },
        include: {
          role: true,
          teamsToEvaluate: {
            where: { isActive: true },
            select: { id: true },
          },
        },
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

      const assignedTeams = evaluator.teamsToEvaluate;
      const assignmentCount = assignedTeams.length;

      if (assignmentCount === 0) {
        return {
          message:
            'El evaluador (jurado o profesor) no tiene asignaciones para eliminar',
          asignacionesEliminadas: 0,
          evaluador: {
            id: evaluator.id,
            nombre: `${evaluator.firstName} ${evaluator.lastName}`,
            email: evaluator.email,
          },
        };
      }

      // Eliminar todas las asignaciones del jurado usando disconnect en cada equipo
      await this.prisma.$transaction(
        assignedTeams.map((team) =>
          this.prisma.team.update({
            where: { id: team.id },
            data: {
              assignedJurors: {
                disconnect: { id: jurorId },
              },
            },
          }),
        ),
      );

      this.logger.log(
        `Se eliminaron ${assignmentCount} asignaciones del evaluador ${jurorId}`,
      );

      return {
        message: `Todas las asignaciones del evaluador (jurado o profesor) han sido eliminadas correctamente`,
        asignacionesEliminadas: assignmentCount,
        evaluador: {
          id: evaluator.id,
          nombre: `${evaluator.firstName} ${evaluator.lastName}`,
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
        'Error al eliminar todas las asignaciones del evaluador',
      );
    }
  }

  async removeJurorFromTeam(jurorId: string, teamId: number): Promise<any> {
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

      // Eliminar la asignación
      const updatedTeam = await this.prisma.$transaction(async (tx) => {
        // Eliminar la relación usando disconnect
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

        // Obtener el equipo actualizado
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

  // NUEVO: Jurados disponibles para asignar a un equipo
  async getAvailableForTeam(teamId: number) {
    // 1. Buscar el equipo con sus jurados ya asignados
    const dict_to_search_team = {
      where: { id: teamId },
      include: {
        assignedJurors: {
          where: { isActive: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: { select: { name: true } },
          },
        },
      },
    };
    const team = await this.prisma.team.findUnique(dict_to_search_team);

    if (!team || !team.isActive) {
      throw new NotFoundException('Equipo no encontrado');
    }

    //2. Extraer el nivel del equipo (ej: "N2-AYP-05" - Nivel 2)
    const teamLevel = this.extractLevelFromTeamCode(team.teamCode);

    if (teamLevel === null) {
      throw new BadRequestException(
        'El equipo no tiene un codigo de nivel valido',
      );
    }

    // [MODIFICADO]: Para universitarios (N1-N4), se muestran ambos roles disponibles
    // [ANTES]: Solo se mostraba un rol (Jurados para universitarios, Profesores para colegios)
    // 3. Decidir qué roles pueden evaluar este equipo:
    //   Nivel 0 (Colegios): solo profesores (Senior)
    //   Nivel 1-4 (Universitarios): jurados (Junior) + profesores (Senior)
    const roleFilter =
      teamLevel === 0
        ? { roleId: this.professorRoleId }
        : { OR: [{ roleId: this.jurorRoleId }, { roleId: this.professorRoleId }] };

    // 4. Ahora traemos TODOS los usuarios con los roles correspondientes
    const dict_to_search_users = {
      where: { isActive: true, ...roleFilter },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: { select: { name: true } },
        teamsToEvaluate: {
          //Equipos ya asignados
          where: { isActive: true },
          select: { id: true },
        },
      },
    };
    const allEvaluators = await this.prisma.user.findMany(dict_to_search_users);

    // 5. Separar los que ya estan asignados de los que estan disponibles
    const assignedIds = new Set(team.assignedJurors.map((j) => j.id));

    const available = allEvaluators
      .filter((e) => !assignedIds.has(e.id))
      .map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        type: e.role.name, // "Jurado" o "Profesor"
        currentLoad: e.teamsToEvaluate.length, // Cuántos equipos ya tiene
      }))
      .sort((a, b) => a.currentLoad - b.currentLoad); // Menos carga primero

    return {
      teamId: team.id,
      teamName: team.teamName,
      teamLevel,
      currentlyAssigned: team.assignedJurors.map((j) => ({
        id: j.id,
        firstName: j.firstName,
        lastName: j.lastName,
        email: j.email,
        type: j.role.name,
      })),
      available,
    };
  }

  // [MODIFICACIÓN]: Reescritura completa del método autoAssignJurors
  // [AUTOR]: IA  |  [FECHA]: 2026-05-01
  // ─────────────────────────────────────────────────────────────────────────────
  // AUTO-ASSIGN JURORS  —  Asignación por rondas con balanceo de carga
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Asigna automáticamente evaluadores a todos los equipos confirmados.
   *
   * Reglas de negocio actualizadas:
   *  - Límite ESTRICTO de carga: Máximo 6 equipos por evaluador.
   *  - Profesores (Senior, roleId=3) → evalúan N0 y N1-N4.
   *  - Jurados (Junior, roleId=4)  → solo evalúan N1-N4.
   *  - N0 (Colegios) → SOLO Profesores.
   *  - N1-N4 (Universidades) → Intentan tener 1 Profesor y 2 Jurados.
   *  - Objetivo por equipo: Exactamente 3 evaluadores.
   *  - Equidad: Se usan rondas para que todos crezcan parejo.
   *  - Se respetan las asignaciones manuales previas (no se sobreescriben ciegamente).
   */
  async autoAssignJurors(): Promise<{
    message: string;
    resumen: string[];
    advertencias: string[];
  }> {
    const TARGET_PER_TEAM = 3;
    const MAX_LOAD = 6;
    const advertencias: string[] = [];

    // ── PASO 1: Cargar datos, INCLUYENDO asignaciones actuales ───────────────
    const [allTeams, allEvaluators] = await Promise.all([
      this.prisma.team.findMany({
        where: {
          isActive: true,
          videogame: { videogameStatusId: this.confirmedStatusId },
        },
        select: {
          id: true,
          teamCode: true,
          teamName: true,
          // Traemos a los jurados ya asignados para respetarlos
          assignedJurors: { select: { id: true } },
        },
      }),
      this.prisma.user.findMany({
        where: {
          isActive: true,
          OR: [{ roleId: this.jurorRoleId }, { roleId: this.professorRoleId }],
          NOT: { email: 'profesorcolegios@uninorte.edu.co' },
        },
        select: {
          id: true,
          roleId: true,
          firstName: true,
          lastName: true,
          // Traemos la carga actual según base de datos real
          teamsToEvaluate: { where: { isActive: true }, select: { id: true } },
        },
      }),
    ]);

    if (allTeams.length === 0) {
      throw new BadRequestException(
        'No hay equipos confirmados y activos para asignar.',
      );
    }

    // ── PASO 2: Construir estructuras de memoria respetando estado previo ────
    const teamsByLevel = new Map<number, (typeof allTeams)[number][]>();
    const assignmentMap = new Map<number, Set<string>>(); // teamId → evaluadorIds
    const loadMap = new Map<string, number>(); // evaluadorId → carga
    const evaluatorLevels = new Map<string, Set<number>>(); // evaluadorId → niveles evaluados

    // Inicializar mapas para evaluadores
    for (const ev of allEvaluators) {
      // Tomamos la carga real desde la DB (por si evalúan equipos inactivos o manuales)
      loadMap.set(ev.id, ev.teamsToEvaluate.length);
      evaluatorLevels.set(ev.id, new Set());
    }

    // Clasificar equipos y registrar asignaciones previas
    for (const team of allTeams) {
      const level = this.extractLevelFromTeamCode(team.teamCode);
      if (level === null) {
        advertencias.push(
          `Equipo "${team.teamName}" (código: "${team.teamCode}") tiene formato inválido y fue omitido.`,
        );
        continue;
      }
      if (!teamsByLevel.has(level)) teamsByLevel.set(level, []);
      teamsByLevel.get(level)!.push(team);

      const assignedSet = new Set<string>();
      for (const j of team.assignedJurors) {
        assignedSet.add(j.id);
        // Si el jurado existe en la lista de evaluadores elegibles, marcamos su nivel
        if (evaluatorLevels.has(j.id)) {
          evaluatorLevels.get(j.id)!.add(level);
        }
      }
      assignmentMap.set(team.id, assignedSet);
    }

    if (assignmentMap.size === 0) {
      throw new BadRequestException(
        'No se encontraron equipos con formato de nivel válido (N<número>-...).',
      );
    }

    const professors = allEvaluators.filter((e) => e.roleId === this.professorRoleId);
    const jurors = allEvaluators.filter((e) => e.roleId === this.jurorRoleId);
    const allLevels = Array.from(teamsByLevel.keys()).sort((a, b) => a - b);

    this.logger.log(
      `autoAssignJurors: ${allTeams.length} equipos, ${professors.length} profesores, ${jurors.length} jurados. Límite: ${MAX_LOAD}.`,
    );

    // ── PASO 3: Función auxiliar para asignar por rondas ─────────────────────
    // Esto garantiza crecimiento equitativo (todos crecen a 1, luego a 2, luego a 3).
    const assignRounds = (
      teams: (typeof allTeams)[number][],
      pool: typeof allEvaluators,
      level: number,
      maxPerTeamForThisStep: number,
    ) => {
      if (pool.length === 0 || teams.length === 0) return;

      // Hacemos iteraciones incrementando el objetivo para que sea realmente equitativo.
      // Primero aseguramos que todos tengan 1, luego que todos tengan 2, etc.
      for (let targetSize = 1; targetSize <= maxPerTeamForThisStep; targetSize++) {
        for (const team of teams) {
          const current = assignmentMap.get(team.id)!;
          if (current.size >= targetSize) continue;

          // Filtrar pool: que no esté asignado, y que su carga sea ESTRICTAMENTE menor a MAX_LOAD
          const available = pool
            .filter((ev) => !current.has(ev.id) && (loadMap.get(ev.id) ?? 0) < MAX_LOAD)
            .sort((a, b) => {
              const levelsA = evaluatorLevels.get(a.id)!;
              const levelsB = evaluatorLevels.get(b.id)!;

              const loadA = loadMap.get(a.id) ?? 0;
              const loadB = loadMap.get(b.id) ?? 0;

              // Prioridad 1: menor carga (balanceo estrictamente equitativo entre evaluadores)
              if (loadA !== loadB) {
                return loadA - loadB;
              }

              // Prioridad 2: ya está evaluando este nivel o no evalúa nada aún
              const inLevelA = levelsA.has(level) || levelsA.size === 0;
              const inLevelB = levelsB.has(level) || levelsB.size === 0;
              if (inLevelA && !inLevelB) return -1;
              if (!inLevelA && inLevelB) return 1;

              return 0;
            });

          if (available.length > 0) {
            const chosen = available[0]; // El mejor candidato según el orden
            current.add(chosen.id);
            loadMap.set(chosen.id, (loadMap.get(chosen.id) ?? 0) + 1);
            evaluatorLevels.get(chosen.id)!.add(level);
          }
        }
      }
    };

    // ── PASO 4: Asignar Colegios (N0) - SOLO PROFESORES ──────────────────────
    if (teamsByLevel.has(0)) {
      const colegioTeams = teamsByLevel.get(0)!;
      assignRounds(colegioTeams, professors, 0, TARGET_PER_TEAM);
    }

    // ── PASO 5: Asignar Universitarios (N1-N4) ───────────────────────────────
    const universityLevels = allLevels.filter((l) => l > 0);

    // 5.1: Intentar dar al menos UN Profesor a cada equipo universitario
    for (const level of universityLevels) {
      const teams = teamsByLevel.get(level)!;
      for (const team of teams) {
        const current = assignmentMap.get(team.id)!;
        if (current.size >= TARGET_PER_TEAM) continue;

        // Verificar si ya tiene un profesor asignado
        const hasProfessor = Array.from(current).some((id) =>
          professors.some((p) => p.id === id),
        );

        if (!hasProfessor) {
          // Intentar darle el profesor con menor carga (límite estricto < MAX_LOAD)
          const availableProfs = professors
            .filter((p) => !current.has(p.id) && (loadMap.get(p.id) ?? 0) < MAX_LOAD)
            .sort((a, b) => (loadMap.get(a.id) ?? 0) - (loadMap.get(b.id) ?? 0));

          if (availableProfs.length > 0) {
            const chosen = availableProfs[0];
            current.add(chosen.id);
            loadMap.set(chosen.id, (loadMap.get(chosen.id) ?? 0) + 1);
            evaluatorLevels.get(chosen.id)!.add(level);
          }
        }
      }
    }

    // 5.2: Rellenar equitativamente el resto (hasta 3) con Jurados Junior
    for (const level of universityLevels) {
      const teams = teamsByLevel.get(level)!;
      // Los jurados intentan completar lo que falta (ya sea que tengan profesor o no)
      assignRounds(teams, jurors, level, TARGET_PER_TEAM);
    }

    // ── PASO 6: Fase Final de Rescate ────────────────────────────────────────
    // Si aún faltan jurados para N1-N4 y hay profesores libres, se usan profesores.
    // Si faltan para N0 y hay profesores libres, se completa (ya cubierto en assignRounds, 
    // pero repetimos por si se liberó espacio o fue por fases).
    for (const level of allLevels) {
      const teams = teamsByLevel.get(level)!;
      const pool = level === 0 ? professors : [...jurors, ...professors];
      assignRounds(teams, pool, level, TARGET_PER_TEAM);
    }

    // ── PASO 7: Validaciones y Advertencias ──────────────────────────────────
    for (const [teamId, evaluatorsSet] of assignmentMap.entries()) {
      const team = allTeams.find((t) => t.id === teamId);
      const total = evaluatorsSet.size;

      if (total > TARGET_PER_TEAM) {
        // En caso de que asignaciones manuales previas ya superaran el target
        advertencias.push(`Equipo "${team?.teamName}" tiene ${total} evaluadores (supera el objetivo de ${TARGET_PER_TEAM} por asignación manual previa).`);
      } else if (total < TARGET_PER_TEAM) {
        advertencias.push(`Equipo "${team?.teamName}" quedó con ${total} evaluador(es) debido al límite estricto de ${MAX_LOAD} equipos por jurado.`);
      }
    }

    for (const [evId, load] of loadMap.entries()) {
      if (load > MAX_LOAD) {
        const ev = allEvaluators.find((e) => e.id === evId);
        if (ev) {
          advertencias.push(`Evaluador "${ev.firstName} ${ev.lastName}" tiene ${load} equipos (sobrepasó el límite por asignaciones manuales previas).`);
        }
      }
    }

    // ── PASO 8: Persistir en la Base de Datos ────────────────────────────────
    const updates = Array.from(assignmentMap.entries()).map(([teamId, ids]) =>
      this.prisma.team.update({
        where: { id: teamId },
        data: {
          assignedJurors: {
            // El set respetará las asignaciones manuales antiguas que recolectamos 
            // en el Paso 2 y guardará las nuevas.
            set: Array.from(ids).map((id) => ({ id })),
          },
        },
      }),
    );

    await this.prisma.$transaction(updates);

    this.logger.log(
      `autoAssignJurors completado: ${updates.length} equipos actualizados.`,
    );

    // ── PASO 9: Construir resumen legible ────────────────────────────────────
    const resumen: string[] = [];

    for (const level of allLevels) {
      const teams = teamsByLevel.get(level)!;
      const counts = teams.map((t) => assignmentMap.get(t.id)!.size);
      const minC = Math.min(...counts);
      const maxC = Math.max(...counts);
      const avg = (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1);
      const label = level === 0 ? 'Colegios (N0)' : `Universitarios N${level}`;
      resumen.push(
        minC === maxC
          ? `${label}: ${teams.length} equipos × ${minC} evaluadores c/u`
          : `${label}: ${teams.length} equipos, ${minC}-${maxC} evaluadores (promedio: ${avg})`,
      );
    }

    const loadValues = Array.from(loadMap.values()).filter((l) => l > 0);
    if (loadValues.length > 0) {
      const avgLoad = (
        loadValues.reduce((a, b) => a + b, 0) / loadValues.length
      ).toFixed(1);
      const maxLoadVal = Math.max(...loadValues);
      resumen.push(
        `Carga de evaluadores: promedio ${avgLoad}, máximo ${maxLoadVal} equipos (${loadValues.length} evaluadores activos)`,
      );
    }

    return {
      message: 'Asignación automática completada correctamente respetando los límites.',
      resumen,
      advertencias,
    };
  }
}
