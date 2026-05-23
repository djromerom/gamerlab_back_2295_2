import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  JurorCategory,
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
  ) {}
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
        `Error during registration for ${dto.email}: ${
          error instanceof Error ? error.message : error
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

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.email !== undefined && { email: dto.email }),
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
  private validateEvaluatorCategoryForLevel(
    evaluator: {
      roleId: number;
      jurorCategory?: JurorCategory | null;
    },
    teamLevel: number,
  ) {
    // Profesor: mantiene regla actual, solo colegios (nivel 0)
    if (evaluator.roleId === this.professorRoleId) {
      if (teamLevel !== 0) {
        throw new BadRequestException(
          'Los profesores solo pueden ser asignados a equipos de nivel 0 (colegios)',
        );
      }
      return;
    }

    // Jurado: ahora sí se distingue por categoría
    if (evaluator.roleId === this.jurorRoleId) {
      if (!evaluator.jurorCategory) {
        throw new BadRequestException(
          'El jurado no tiene categoría asignada (JUNIOR/SENIOR)',
        );
      }

      // Regla nueva: Junior no puede ir a colegios
      if (teamLevel === 0 && evaluator.jurorCategory === JurorCategory.JUNIOR) {
        throw new BadRequestException(
          'Los jurados JUNIOR no pueden ser asignados a colegios (nivel 0)',
        );
      }

      // SENIOR sí puede ir a nivel 0 y a otros niveles, salvo que luego
      // definas una restricción adicional por categoría del equipo.
      return;
    }

    throw new BadRequestException(
      'El usuario debe ser un jurado o un profesor',
    );
  }

  private getEvaluatorLabel(evaluator: {
    roleId: number;
    jurorCategory?: JurorCategory | null;
  }): string {
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
  // Para modificar la lista de correos permitidos para calificar colegios,
  // puedes editar esta constante. Podrías mover esto a variables de entorno en un futuro.
  private readonly COLEGIO_JUROR_EMAILS = [
    'edangulo@uninorte.edu.co',
    'rramos@uninorte.edu.co',
    'mrgamarra@uninorte.edu.co',
    'katherineospino@uninorte.edu.co',
    'pineresm@uninorte.edu.co',
    'djromero@uninorte.edu.co',
  ];

  async asingEvaluations(): Promise<{ message: string; details: string[] }> {
    const MAX_PER_TEAM = 3;
    const MAX_PER_JUROR = 6;
    const results: string[] = [];

    const latestEdition = await this.prisma.edition.findFirst({
      orderBy: {
        id: 'desc',
      },
    });

    // MODIFICADO: Se implemento el BadRequest para esta validacion
    if (!latestEdition) {
      throw new BadRequestException('No hay ediciones disponibles.');
    }

    const teams = await this.getTeams(latestEdition.id);
    const allJurorsMap = await this.getJurors(false);
    const allProfessorsMap = await this.getJurors(true);

    // MODIFICADO: Se añadio el BadRequestException a esta otra validacion
    if (teams.length === 0) {
      throw new BadRequestException(
        'No hay equipos confirmados y activos para asignar.',
      );
    }

    const allEvaluators = new Map<string, number>();
    for (const [id, count] of allJurorsMap) allEvaluators.set(id, count);
    for (const [id, count] of allProfessorsMap) allEvaluators.set(id, count);

    // MODIFICACION: Validación nueva — sin evaluadores la asignación no tiene sentido
    if (allEvaluators.size === 0) {
      throw new BadRequestException(
        'No hay jurados ni profesores activos disponibles para realizar la asignación.',
      );
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: Array.from(allEvaluators.keys()) } },
      select: { id: true, email: true },
    });

    const userEmailMap = new Map<string, string>();
    for (const u of users) userEmailMap.set(u.id, u.email);

    const teamsByLevel = new Map<number, typeof teams>();
    for (const team of teams) {
      const level = team.teamCode
        ? this.extractLevelFromTeamCode(team.teamCode)
        : null;
      if (level === null) continue;
      if (!teamsByLevel.has(level)) teamsByLevel.set(level, []);
      teamsByLevel.get(level)!.push(team);
    }

    const assignments = new Map<number, string[]>();
    const evaluatorLoad = new Map<string, number>(); // Carga actual de evaluaciones por jurado
    const totalSlots = teams.length * MAX_PER_TEAM; // Total de evaluaciones a realizar
    const targetLoad = Math.ceil(totalSlots / allEvaluators.size); // Promedio de evaluaciones por jurado

    const evaluatorLevels = new Map<string, Set<number>>(); // Niveles de equipos que puede evaluar cada jurado

    // Inicializamos la carga y los niveles para cada jurado
    for (const [id] of allEvaluators) {
      evaluatorLoad.set(id, 0);
      evaluatorLevels.set(id, new Set<number>());
    }

    for (const team of teams) {
      const level = team.teamCode
        ? this.extractLevelFromTeamCode(team.teamCode)
        : null;
      if (level === null) continue;

      const existing = team.assignedJurors
        .filter(
          (j) =>
            j.roleId === this.professorRoleId || j.roleId === this.jurorRoleId,
        )
        .map((j) => j.id)
        .filter((id, i, arr) => arr.indexOf(id) === i);

      assignments.set(team.id, [...existing]);

      for (const jid of existing) {
        if (evaluatorLoad.has(jid)) {
          evaluatorLoad.set(jid, (evaluatorLoad.get(jid) ?? 0) + 1);
          evaluatorLevels.get(jid)?.add(level); // Agregamos el nivel del equipo al conjunto de niveles que puede evaluar el jurado
        }
      }
    }

    const assignFromPool = (
      teamId: number,
      needed: number,
      allowedEmails: string[] | null,
      level: number,
    ): void => {
      const current = assignments.get(teamId)!;
      if (needed <= 0 || current.length >= MAX_PER_TEAM) return;

      const candidates = Array.from(evaluatorLoad.entries())
        .filter(([id, load]) => load < MAX_PER_JUROR && !current.includes(id))
        .filter(([id]) => {
          const email = userEmailMap.get(id);
          if (allowedEmails === null) return true;
          return email && allowedEmails.includes(email);
        })
        .sort((a, b) => {
          const idA = a[0],
            loadA = a[1];
          const idB = b[0],
            loadB = b[1];

          const aUnderTarget = loadA < targetLoad;
          const bUnderTarget = loadB < targetLoad;

          if (aUnderTarget !== bUnderTarget) return aUnderTarget ? -1 : 1;

          const aHasCurrent = evaluatorLevels.get(idA)?.has(level);
          const bHasCurrent = evaluatorLevels.get(idB)?.has(level);

          if (aHasCurrent !== bHasCurrent) return aHasCurrent ? -1 : 1;

          const maxLevelA = Math.max(
            -1,
            ...Array.from(evaluatorLevels.get(idA) ?? []).filter(
              (l) => l < level,
            ),
          );
          const maxLevelB = Math.max(
            -1,
            ...Array.from(evaluatorLevels.get(idB) ?? []).filter(
              (l) => l < level,
            ),
          );

          if (maxLevelA !== maxLevelB) return maxLevelB - maxLevelA;

          return loadA - loadB;
        });

      for (const [id, load] of candidates) {
        if (current.length >= MAX_PER_TEAM || needed <= 0) break;
        current.push(id);
        evaluatorLoad.set(id, load + 1);
        evaluatorLevels.get(id)?.add(level);
        needed--;
      }
    };

    const sortedLevels = Array.from(teamsByLevel.keys()).sort((a, b) => a - b);

    for (const level of sortedLevels) {
      const levelTeams = teamsByLevel.get(level)!;

      if (level === 0) {
        for (const team of levelTeams) {
          const needed = MAX_PER_TEAM - assignments.get(team.id)!.length;
          assignFromPool(team.id, needed, this.COLEGIO_JUROR_EMAILS, level);
        }
      } else {
        for (const team of levelTeams) {
          const needed = MAX_PER_TEAM - assignments.get(team.id)!.length;
          assignFromPool(team.id, needed, null, level);
        }
      }

      const counts = levelTeams.map((t) => assignments.get(t.id)!.length);
      if (counts.length === 0) continue;
      const min = Math.min(...counts),
        max = Math.max(...counts);
      const label = level === 0 ? 'Colegios (N0)' : `Universitarios N${level}`;
      const withFull = counts.filter((c) => c === MAX_PER_TEAM).length;
      results.push(
        `${label}: ${levelTeams.length} equipos | ${withFull} con ${MAX_PER_TEAM} evaluadores | rango: ${min}-${max}`,
      );
    }

    this.logger.log('Guardando asignaciones en la base de datos...');
    await this.prisma.$transaction(
      Array.from(assignments.entries()).map(([teamId, jurorIds]) =>
        this.prisma.team.update({
          where: { id: teamId },
          data: { assignedJurors: { set: jurorIds.map((id) => ({ id })) } },
        }),
      ),
    );

    const totalTeams = teams.length;
    const fullTeams = Array.from(assignments.values()).filter(
      (ids) => ids.length === MAX_PER_TEAM,
    ).length;
    const allOk = fullTeams === totalTeams;

    results.unshift(
      `✅ ${fullTeams}/${totalTeams} equipos con exactamente ${MAX_PER_TEAM} jurados.`,
    );

    return {
      message: allOk
        ? 'Evaluaciones asignadas correctamente'
        : `Faltaron jurados para completar ${totalTeams - fullTeams} equipo(s).`,
      details: results,
    };
  }
  // Modificado: Se ha agregado un edition_id para filtrar los equipos por edición
  async getTeams(editionId: number) {
    try {
      // Obtener TODOS los equipos activos con videojuegos confirmados
      // Esto incluye todos los niveles (0, 1, 2, 3, 4, etc.)
      const allTeams = await this.prisma.team.findMany({
        where: {
          editionId: editionId, // Se ha agregado un edition_id para filtrar los equipos por edición
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

  async assignJurorToTeam(
    jurorId: string,
    teamId: number,
    actorUserId: string,
  ): Promise<any> {
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
          'No se pudo determinar el nivel del equipo. El código del equipo debe tener formato N<número>-... (ej: N1-AYP-06)',
        );
      }

      this.validateEvaluatorCategoryForLevel(juror, teamLevel);

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

      if (existingTeams.length > 0) {
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

          if (existingLevel !== teamLevel) {
            const evaluatorType =
              juror.roleId === this.professorRoleId ? 'profesor' : 'jurado';
            throw new BadRequestException(
              `El ${evaluatorType} ya está asignado a equipos de nivel ${existingLevel}. Solo puede evaluar equipos del mismo nivel.`,
            );
          }
        }
      }

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

        // Debe mantenerse en el mismo nivel
        if (existingLevel !== teamLevel) {
          const evaluatorLabel = this.getEvaluatorLabel(juror);
          throw new BadRequestException(
            `El ${evaluatorLabel} ya está asignado a equipos de nivel ${existingLevel}. Solo puede evaluar equipos del mismo nivel.`,
          );
        }

        // Y ese nivel también debe ser válido para su categoría
        this.validateEvaluatorCategoryForLevel(juror, existingLevel);
      }

      // Asignar el jurado al equipo y registrar auditoría
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

        await this.jurorAssignmentAuditService.create(
          {
            action: ManualJurorAssignmentAction.ASSIGN,
            actorUserId,
            teamId,
            jurorId,
            newJurorId: jurorId,
            notes: 'Asignación manual desde módulo admin',
          },
          tx,
        );

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

  async removeAllJurorAssignments(actorUserId: string): Promise<any> {
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
        throw new BadRequestException(
          'No hay asignaciones de evaluadores (jurados o profesores) para eliminar',
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
            notes: `Se eliminaron manualmente ${assignmentCount} asignaciones de evaluadores`,
          },
          tx,
        );
      });

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

  async removeAllAssignmentsFromJuror(
    jurorId: string,
    actorUserId: string,
  ): Promise<any> {
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

      await this.prisma.$transaction(async (tx) => {
        for (const team of assignedTeams) {
          await tx.team.update({
            where: { id: team.id },
            data: {
              assignedJurors: {
                disconnect: { id: jurorId },
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
            notes: `Se eliminaron todas las asignaciones del evaluador ${jurorId}`,
          },
          tx,
        );
      });

      this.logger.log(
        `Se eliminaron ${assignmentCount} asignaciones del evaluador ${jurorId}`,
      );

      return {
        message:
          'Todas las asignaciones del evaluador (jurado o profesor) han sido eliminadas correctamente',
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

  async reassignJurorOnTeam(
    currentJurorId: string,
    newJurorId: string,
    teamId: number,
    actorUserId: string,
  ): Promise<any> {
    if (currentJurorId === newJurorId) {
      throw new BadRequestException(
        'El jurado actual y el nuevo jurado no pueden ser el mismo',
      );
    }

    const newJuror = await this.prisma.user.findUnique({
      where: { id: newJurorId },
      include: { role: true },
    });

    if (!newJuror || !newJuror.isActive) {
      throw new NotFoundException('Nuevo evaluador no encontrado o inactivo');
    }

    if (
      newJuror.roleId !== this.jurorRoleId &&
      newJuror.roleId !== this.professorRoleId
    ) {
      throw new BadRequestException(
        'El nuevo usuario no es un jurado ni un profesor',
      );
    }

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
            roleId: true,
          },
        },
        videogame: true,
      },
    });

    if (!team || !team.isActive) {
      throw new NotFoundException('Equipo no encontrado o inactivo');
    }

    const isCurrentlyAssigned = team.assignedJurors.some(
      (j) => j.id === currentJurorId,
    );
    if (!isCurrentlyAssigned) {
      throw new NotFoundException(
        'El evaluador actual no está asignado a este equipo',
      );
    }

    const isNewAlreadyAssigned = team.assignedJurors.some(
      (j) => j.id === newJurorId,
    );
    if (isNewAlreadyAssigned) {
      throw new ConflictException(
        'El nuevo evaluador ya está asignado a este equipo',
      );
    }

    const teamLevel = this.extractLevelFromTeamCode(team.teamCode);
    if (teamLevel === null) {
      throw new BadRequestException(
        'No se pudo determinar el nivel del equipo. El código debe tener formato N<número>-...',
      );
    }

    const existingTeamsOfNewEvaluator = await this.prisma.team.findMany({
      where: {
        isActive: true,
        assignedJurors: {
          some: { id: newJurorId },
        },
      },
      select: {
        id: true,
        teamCode: true,
      },
    });

    for (const existingTeam of existingTeamsOfNewEvaluator) {
      const existingLevel = this.extractLevelFromTeamCode(
        existingTeam.teamCode,
      );

      if (existingLevel === null) {
        this.logger.warn(
          `No se pudo extraer el nivel del equipo existente con código: ${existingTeam.teamCode}`,
        );
        continue;
      }

      if (existingLevel !== teamLevel) {
        const evaluatorLabel = this.getEvaluatorLabel(newJuror);
        throw new BadRequestException(
          `El ${evaluatorLabel} ya está asignado a equipos de nivel ${existingLevel}. Solo puede evaluar equipos del mismo nivel.`,
        );
      }

      this.validateEvaluatorCategoryForLevel(newJuror, existingLevel);
    }

    const updatedTeam = await this.prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id: teamId },
        data: {
          assignedJurors: {
            disconnect: { id: currentJurorId },
          },
        },
      });

      await tx.team.update({
        where: { id: teamId },
        data: {
          assignedJurors: {
            connect: { id: newJurorId },
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
          notes: 'Reasignación manual desde módulo admin',
        },
        tx,
      );

      return tx.team.findUnique({
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
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    });

    return {
      message: 'Evaluador reasignado correctamente',
      equipo: {
        id: updatedTeam?.id,
        nombre: updatedTeam?.teamName,
        videojuego: updatedTeam?.videogame?.name || null,
        juradosAsignados:
          updatedTeam?.assignedJurors.map((j) => ({
            id: j.id,
            nombre: `${j.firstName} ${j.lastName}`,
            email: j.email,
          })) || [],
        cantidadJurados: updatedTeam?.assignedJurors.length || 0,
      },
    };
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
}
