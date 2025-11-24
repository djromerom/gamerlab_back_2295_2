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
import { AuthService } from 'src/auth/auth.service';
import { Prisma, User, Role } from '@prisma/client';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { JurorListItem } from './types/juror-list-item.type';

@Injectable()
export class JurorService {
  private readonly logger = new Logger(AuthService.name);
  private readonly JUROR_ROLE_NAME = "Jurado";
  private readonly PROFESSOR_ROLE_NAME = "Profesor";
  private readonly CONFIRMED_STATUS_NAME = "CONFIRMADO";
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

      const jurorRole: Role | null = await this.prisma.role.findUnique({
        where: { name: this.JUROR_ROLE_NAME, isActive: true }
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

      // Buscar ID del rol "Profesor"
      const professorRole: Role | null = await this.prisma.role.findUnique({
        where: { name: this.PROFESSOR_ROLE_NAME, isActive: true }
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

      // Buscar ID del estado "CONFIRMADO"
      const confirmedStatus = await this.prisma.confirmationStatus.findUnique({
        where: { status: this.CONFIRMED_STATUS_NAME, isActive: true },
      });

      if (!confirmedStatus) {
        this.logger.error(`FATAL: Confirmation status '${this.CONFIRMED_STATUS_NAME}' not found.`);
        throw new InternalServerErrorException(`Missing confirmation status '${this.CONFIRMED_STATUS_NAME}'.`);
      }

      this.confirmedStatusId = confirmedStatus.id;
      this.logger.log(`Confirmation status ID initialized: ${this.confirmedStatusId}`);

    } catch (error) {
      if (error instanceof Error)
        this.logger.error(`Initialization failed: ${error.message}`, error.stack);
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
          isActive: true 
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
      isActive: true
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
    return this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
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

  async asingEvaluations() {
    const allJurors = await this.getJurors();
    const teams = await this.getTeams();

    this.logger.log(`Jurados disponibles: ${allJurors.size}, Equipos disponibles: ${teams.length}`);

    if (allJurors.size === 0 && teams.length === 0) {
      return {
        message: "No hay jurados ni equipos disponibles para asignar evaluaciones",
        details: {
          jurados: 0,
          equipos: 0,
        },
      };
    }

    if (allJurors.size === 0) {
      return {
        message: "No hay jurados disponibles para asignar evaluaciones",
        details: {
          jurados: 0,
          equipos: teams.length,
        },
      };
    }

    if (teams.length === 0) {
      return {
        message: "No hay equipos disponibles para asignar evaluaciones",
        details: {
          jurados: allJurors.size,
          equipos: 0,
        },
      };
    }

    // Agrupar equipos por nivel
    const teamsByLevel = new Map<number, typeof teams>();
    let teamsWithoutCode = 0;
    let teamsWithInvalidCode = 0;

    for (const team of teams) {
      // Verificar que el equipo tenga teamCode
      if (!team.teamCode || team.teamCode.trim() === '') {
        teamsWithoutCode++;
        this.logger.warn(`Equipo ID ${team.id} no tiene teamCode`);
        continue;
      }

      const level = this.extractLevelFromTeamCode(team.teamCode);
      if (level === null) {
        teamsWithInvalidCode++;
        this.logger.warn(`No se pudo extraer el nivel del equipo ID ${team.id} con código: ${team.teamCode}`);
        continue;
      }

      if (!teamsByLevel.has(level)) {
        teamsByLevel.set(level, []);
      }
      teamsByLevel.get(level)!.push(team);
    }

    if (teamsByLevel.size === 0) {
      return {
        message: "No se encontraron equipos con formato de nivel válido (N<número>-...)",
        details: {
          totalEquipos: teams.length,
          equiposSinCodigo: teamsWithoutCode,
          equiposConCodigoInvalido: teamsWithInvalidCode,
          equiposConNivelValido: 0,
        },
      };
    }

    this.logger.log(`Equipos agrupados por nivel: ${Array.from(teamsByLevel.entries()).map(([level, teams]) => `Nivel ${level}: ${teams.length} equipos`).join(', ')}`);

    // Para cada nivel, distribuir evaluadores equitativamente
    const results: string[] = [];

    for (const [level, levelTeams] of teamsByLevel.entries()) {
      // Para nivel 0 (colegios), usar profesores; para otros niveles, usar jurados
      let currentEvaluators: Map<string, number>;
      if (level === 0) {
        // Nivel 0: usar profesores (solo profesores que no tengan equipos asignados de otros niveles)
        const allProfessors = await this.getJurors(true);
        currentEvaluators = await this.filterEvaluatorsByLevel(allProfessors, 0, true);
      } else {
        // Otros niveles: usar jurados (solo jurados que no tengan equipos de nivel 0 u otros niveles)
        currentEvaluators = await this.filterEvaluatorsByLevel(allJurors, level, false);
      }

      // Ordenar evaluadores por carga actual (menos evaluaciones primero)
      // Esto asegura que los evaluadores con menos carga se asignen primero
      let sortedEvaluators = Array.from(currentEvaluators.entries()).sort((a, b) => a[1] - b[1]);

      const availableEvaluators = sortedEvaluators.length;

      if (availableEvaluators === 0) {
        const evaluatorType = level === 0 ? 'profesores' : 'jurados';
        results.push(`Nivel ${level}: No hay ${evaluatorType} disponibles (sin asignaciones previas de otros niveles)`);
        continue;
      }

      // Garantizar que cada equipo reciba al menos 1 evaluador
      const totalTeams = levelTeams.length;
      
      // Primero, asignar al menos 1 evaluador a cada equipo de forma circular
      const assignments: Array<{ teamId: number; jurorIds: string[] }> = [];
      
      // Inicializar asignaciones vacías
      for (const team of levelTeams) {
        assignments.push({
          teamId: team.id,
          jurorIds: [],
        });
      }
      
      // Paso 1: Asignar al menos 1 evaluador a cada equipo de forma circular
      // Esto asegura que ningún equipo quede sin evaluador
      // Si hay más equipos que evaluadores, los evaluadores se asignarán de forma circular
      let evaluatorRoundRobinIndex = 0;
      const evaluatorsAssignedInStep1 = Math.min(totalTeams, availableEvaluators);
      
      for (let teamIdx = 0; teamIdx < evaluatorsAssignedInStep1; teamIdx++) {
        // Obtener el evaluador con menor carga (circular)
        sortedEvaluators = Array.from(currentEvaluators.entries()).sort((a, b) => a[1] - b[1]);
        const evaluatorIndex = evaluatorRoundRobinIndex % sortedEvaluators.length;
        const [evaluatorId, currentLoad] = sortedEvaluators[evaluatorIndex];
        
        // Asignar el evaluador al equipo
        assignments[teamIdx].jurorIds.push(evaluatorId);
        
        // Actualizar la carga
        currentEvaluators.set(evaluatorId, currentLoad + 1);
        if (level !== 0) {
          allJurors.set(evaluatorId, currentLoad + 1);
        }
        
        evaluatorRoundRobinIndex++;
      }
      
      // Si hay más equipos que evaluadores, asignar evaluadores de forma circular
      // a los equipos restantes
      for (let teamIdx = evaluatorsAssignedInStep1; teamIdx < totalTeams; teamIdx++) {
        sortedEvaluators = Array.from(currentEvaluators.entries()).sort((a, b) => a[1] - b[1]);
        if (sortedEvaluators.length > 0) {
          const evaluatorIndex = evaluatorRoundRobinIndex % sortedEvaluators.length;
          const [evaluatorId, currentLoad] = sortedEvaluators[evaluatorIndex];
          
          assignments[teamIdx].jurorIds.push(evaluatorId);
          currentEvaluators.set(evaluatorId, currentLoad + 1);
          if (level !== 0) {
            allJurors.set(evaluatorId, currentLoad + 1);
          }
          
          evaluatorRoundRobinIndex++;
        }
      }
      
      // Paso 2: Distribuir los evaluadores restantes equitativamente entre los equipos
      // Ya asignamos 1 evaluador a cada equipo, ahora distribuimos el resto
      const evaluatorsAlreadyAssigned = Math.min(totalTeams, availableEvaluators);
      const remainingEvaluators = availableEvaluators - evaluatorsAlreadyAssigned;
      
      if (remainingEvaluators > 0) {
        // Calcular cuántos evaluadores adicionales asignar por equipo
        const additionalEvaluatorsPerTeam = Math.floor(remainingEvaluators / totalTeams);
        const extraEvaluators = remainingEvaluators % totalTeams;
        
        for (let teamIdx = 0; teamIdx < totalTeams; teamIdx++) {
          const team = assignments[teamIdx];
          // Calcular cuántos evaluadores adicionales asignar a este equipo
          const additionalEvaluators = additionalEvaluatorsPerTeam + (teamIdx < extraEvaluators ? 1 : 0);
          
          for (let i = 0; i < additionalEvaluators; i++) {
            // Obtener el evaluador con menor carga
            sortedEvaluators = Array.from(currentEvaluators.entries()).sort((a, b) => a[1] - b[1]);
            
            // Encontrar un evaluador que no esté ya asignado a este equipo
            let evaluatorAssigned = false;
            for (const [evaluatorId, currentLoad] of sortedEvaluators) {
              if (!team.jurorIds.includes(evaluatorId)) {
                team.jurorIds.push(evaluatorId);
                currentEvaluators.set(evaluatorId, currentLoad + 1);
                if (level !== 0) {
                  allJurors.set(evaluatorId, currentLoad + 1);
                }
                evaluatorAssigned = true;
                break;
              }
            }
            
            // Si todos los evaluadores ya están asignados a este equipo, asignar el de menor carga
            if (!evaluatorAssigned && sortedEvaluators.length > 0) {
              const [evaluatorId, currentLoad] = sortedEvaluators[0];
              team.jurorIds.push(evaluatorId);
              currentEvaluators.set(evaluatorId, currentLoad + 1);
              if (level !== 0) {
                allJurors.set(evaluatorId, currentLoad + 1);
              }
            }
          }
        }
      }
      
      // Verificar que todos los equipos tengan al menos un evaluador
      const teamsWithoutEvaluators = assignments.filter(a => a.jurorIds.length === 0);
      if (teamsWithoutEvaluators.length > 0) {
        this.logger.error(`CRÍTICO: ${teamsWithoutEvaluators.length} equipo(s) quedaron sin evaluadores asignados en nivel ${level}`);
        for (const assignment of teamsWithoutEvaluators) {
          this.logger.error(`  - Equipo ID ${assignment.teamId} no tiene evaluadores`);
          // Intentar asignar el evaluador con menor carga
          if (availableEvaluators > 0) {
            sortedEvaluators = Array.from(currentEvaluators.entries()).sort((a, b) => a[1] - b[1]);
            if (sortedEvaluators.length > 0) {
              const [evaluatorId, currentLoad] = sortedEvaluators[0];
              assignment.jurorIds.push(evaluatorId);
              currentEvaluators.set(evaluatorId, currentLoad + 1);
              if (level !== 0) {
                allJurors.set(evaluatorId, currentLoad + 1);
              }
              this.logger.warn(`  - Asignado evaluador ${evaluatorId} al equipo ${assignment.teamId} como último recurso`);
            }
          }
        }
      }
      
      // Log final de verificación
      const finalTeamsWithoutEvaluators = assignments.filter(a => a.jurorIds.length === 0).length;
      if (finalTeamsWithoutEvaluators === 0) {
        this.logger.log(`✓ Todos los equipos del nivel ${level} tienen al menos 1 evaluador asignado`);
      } else {
        this.logger.error(`✗ ERROR: ${finalTeamsWithoutEvaluators} equipo(s) del nivel ${level} aún no tienen evaluadores asignados`);
      }

      // Actualizar las asignaciones en la base de datos
      for (const assignment of assignments) {
        await this.prisma.$transaction(async (tx) => {
          await tx.team.update({
            where: { id: assignment.teamId },
            data: {
              assignedJurors: {
                set: assignment.jurorIds.map((jurorId) => ({ id: jurorId })),
              },
            },
          });
        });
      }

      // Calcular estadísticas para el mensaje
      const minEvaluators = Math.min(...assignments.map(a => a.jurorIds.length));
      const maxEvaluators = Math.max(...assignments.map(a => a.jurorIds.length));
      const avgEvaluators = (assignments.reduce((sum, a) => sum + a.jurorIds.length, 0) / assignments.length).toFixed(1);
      
      if (minEvaluators === maxEvaluators) {
        const evaluatorType = level === 0 ? (minEvaluators === 1 ? 'profesor' : 'profesores') : (minEvaluators === 1 ? 'jurado' : 'jurados');
        results.push(
          `Nivel ${level}: ${totalTeams} equipos asignados con ${minEvaluators} ${evaluatorType} cada uno`,
        );
      } else {
        const evaluatorType = level === 0 ? 'profesores' : 'jurados';
        results.push(
          `Nivel ${level}: ${totalTeams} equipos asignados (${minEvaluators}-${maxEvaluators} ${evaluatorType} por equipo, promedio: ${avgEvaluators})`,
        );
      }
    }

    return {
      message: "Evaluaciones asignadas correctamente",
      details: results,
    };
  }

  async getTeams() {
    try {
      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          confirmId: this.confirmedStatusId, // Confirmado
        },
        select: {
          id: true,
          teamCode: true,
          assignedJurors: {
            where: {
              isActive: true,
              OR: [
                { roleId: this.jurorRoleId },
                { roleId: this.professorRoleId }
              ]
            },
            select: { 
              id: true,
              roleId: true
            }
          }
        }
      });
      
      // Contar equipos con evaluadores asignados
      const teamsWithEvaluators = teams.filter(t => t.assignedJurors.length > 0).length;
      const teamsWithoutEvaluators = teams.length - teamsWithEvaluators;
      
      this.logger.log(
        `Obtenidos ${teams.length} equipos confirmados y activos para asignación ` +
        `(${teamsWithEvaluators} con evaluadores asignados, ${teamsWithoutEvaluators} sin evaluadores)`
      );
      
      return teams;
    } catch (error) {
      this.logger.error('Error al obtener los equipos:', error);
      throw new InternalServerErrorException("Error al obtener los equipos");
    }
  }

  async getJurors(useProfessors: boolean = false): Promise<Map<string, number>> {
    try {
      const roleId = useProfessors ? this.professorRoleId : this.jurorRoleId;
      const roleName = useProfessors ? this.PROFESSOR_ROLE_NAME : this.JUROR_ROLE_NAME;
      
      const evaluators = await this.prisma.user.findMany({
        where: {
          isActive: true,
          roleId: roleId,
        },
        select: {
          id: true,
        }
      });
      
      // Obtener equipos asignados a estos evaluadores para calcular la carga inicial
      const teamsWithEvaluators = await this.prisma.team.findMany({
        where: {
          isActive: true,
          assignedJurors: {
            some: {
              id: { in: evaluators.map(e => e.id) },
              isActive: true,
              roleId: roleId
            }
          }
        },
        select: {
          assignedJurors: {
            where: {
              isActive: true,
              roleId: roleId
            },
            select: {
              id: true
            }
          }
        }
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

      this.logger.log(`Obtenidos ${evaluators.length} ${roleName}${useProfessors ? 'es' : 's'} para asignación`);
      return evaluatorLoadMap;
    } catch (error) {
      throw new InternalServerErrorException(`Error al obtener los ${useProfessors ? 'profesores' : 'jurados'}`);
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
    isProfessors: boolean
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
            roleId: roleId
          }
        }
      },
      select: {
        teamCode: true,
        assignedJurors: {
          where: {
            isActive: true,
            roleId: roleId
          },
          select: {
            id: true
          }
        }
      }
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
      const assignedLevels = evaluatorLevels.get(evaluatorId) || new Set<number>();
      
      if (isProfessors) {
        // Profesores: solo pueden tener asignaciones de nivel 0
        const hasNonZeroLevel = Array.from(assignedLevels).some(l => l !== 0);
        if (!hasNonZeroLevel) {
          // Puede ser asignado a nivel 0
          filtered.set(evaluatorId, load);
        }
      } else {
        // Jurados: no pueden tener asignaciones de nivel 0, y solo del mismo nivel
        const hasLevelZero = assignedLevels.has(0);
        const hasOtherLevel = Array.from(assignedLevels).some(l => l !== 0 && l !== targetLevel);
        
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

      const evaluatorsMap = new Map<string, {
        id: string;
        nombre: string;
        tipo: string;
        email: string;
        equiposAsignados: { id: number; nombre: string; videojuego: string | null }[];
      }>();

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
      throw new InternalServerErrorException('Error al obtener la lista de evaluadores');
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

      // Validar reglas de asignación por rol
      if (juror.roleId === this.professorRoleId) {
        // Profesores solo pueden ser asignados a nivel 0
        if (teamLevel !== 0) {
          throw new BadRequestException('Los profesores solo pueden ser asignados a equipos de nivel 0 (colegios)');
        }
      } else if (juror.roleId === this.jurorRoleId) {
        // Jurados NO pueden ser asignados a nivel 0
        if (teamLevel === 0) {
          throw new BadRequestException('Los jurados no pueden ser asignados a equipos de nivel 0 (colegios). Solo los profesores pueden evaluar colegios.');
        }
      } else {
        throw new BadRequestException('El usuario debe ser un jurado o un profesor');
      }

      // Verificar que el jurado no esté ya asignado
      const isAlreadyAssigned = team.assignedJurors.some(j => j.id === jurorId);
      if (isAlreadyAssigned) {
        throw new ConflictException('El evaluador ya está asignado a este equipo');
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
        // Verificar que todos los equipos existentes sean del mismo nivel
        for (const existingTeam of existingTeams) {
          const existingLevel = this.extractLevelFromTeamCode(existingTeam.teamCode);
          if (existingLevel === null) {
            this.logger.warn(
              `No se pudo extraer el nivel del equipo existente con código: ${existingTeam.teamCode}`,
            );
            continue;
          }
          if (existingLevel !== teamLevel) {
            const evaluatorType = juror.roleId === this.professorRoleId ? 'profesor' : 'jurado';
            throw new BadRequestException(
              `El ${evaluatorType} ya está asignado a equipos de nivel ${existingLevel}. Solo puede evaluar equipos del mismo nivel.`,
            );
          }
        }
      }
      
      // Verificar que si es profesor, no tenga asignaciones de niveles > 0
      if (juror.roleId === this.professorRoleId) {
        for (const existingTeam of existingTeams) {
          const existingLevel = this.extractLevelFromTeamCode(existingTeam.teamCode);
          if (existingLevel !== null && existingLevel !== 0) {
            throw new BadRequestException(
              'Los profesores solo pueden ser asignados a equipos de nivel 0 (colegios)',
            );
          }
        }
      }
      
      // Verificar que si es jurado, no tenga asignaciones de nivel 0
      if (juror.roleId === this.jurorRoleId) {
        for (const existingTeam of existingTeams) {
          const existingLevel = this.extractLevelFromTeamCode(existingTeam.teamCode);
          if (existingLevel === 0) {
            throw new BadRequestException(
              'Los jurados no pueden ser asignados a equipos de nivel 0 (colegios)',
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
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('El jurado ya está asignado a este equipo');
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
          throw new NotFoundException('Equipo no encontrado después de la asignación');
        }

        return teamWithJurors;
      });

      return {
        message: 'Jurado asignado correctamente al equipo',
        equipo: {
          id: updatedTeam.id,
          nombre: updatedTeam.teamName,
          videojuego: updatedTeam.videogame?.name || null,
          juradosAsignados: updatedTeam.assignedJurors.map(j => ({
            id: j.id,
            nombre: `${j.firstName} ${j.lastName}`,
            email: j.email,
          })),
          cantidadJurados: updatedTeam.assignedJurors.length,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error al asignar jurado a equipo:', error);
      throw new InternalServerErrorException('Error al asignar jurado al equipo');
    }
  }

  async getTeamsWithLessThanThreeJurors(): Promise<any[]> {
    try {
      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          confirmId: this.confirmedStatusId,
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
        .filter(team => team.assignedJurors.length < 3)
        .map(team => ({
          id: team.id,
          nombre: team.teamName,
          videojuego: team.videogame?.name ?? null,
          lider: {
            id: team.user.id,
            nombre: `${team.user.firstName} ${team.user.lastName}`,
            email: team.user.email,
          },
          juradosAsignados: team.assignedJurors.map(juror => ({
            id: juror.id,
            nombre: `${juror.firstName} ${juror.lastName}`,
            email: juror.email,
          })),
          cantidadJurados: team.assignedJurors.length,
        }));
    } catch (error) {
      this.logger.error('Error al obtener equipos con menos de 3 jurados:', error);
      throw new InternalServerErrorException('Error al obtener equipos con menos de 3 jurados');
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

      return teams.map(team => ({
        id: team.id,
        nombre: team.teamName,
        videojuego: team.videogame ? {
          id: team.videogame.id,
          nombre: team.videogame.name,
          descripcion: team.videogame.description,
        } : null,
        lider: {
          id: team.user.id,
          nombre: `${team.user.firstName} ${team.user.lastName}`,
          email: team.user.email,
        },
        juradosAsignados: team.assignedJurors.map(j => ({
          id: j.id,
          nombre: `${j.firstName} ${j.lastName}`,
          email: j.email,
        })),
        cantidadJurados: team.assignedJurors.length,
      }));
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error al obtener equipos asignados al jurado:', error);
      throw new InternalServerErrorException('Error al obtener equipos asignados al jurado');
    }
  }

}
