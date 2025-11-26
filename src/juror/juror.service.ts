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
  private readonly logger = new Logger(JurorService.name);
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

      const jurorRole: Role | null = await this.prisma.role.findFirst({
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

      // Buscar ID del rol de Profesor
      const professorRole: Role | null = await this.prisma.role.findFirst({
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
      
      // Buscar ID del estado de videojuego "CONFIRMADO"
      const confirmedStatus = await this.prisma.videogameStatus.findUnique({
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
    return this.prisma.user.delete({
      where: { id: user.id }
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

    // Obtener todos los profesores y jurados disponibles (sin dividir previamente)
    const allProfessorsMap = await this.getJurors(true);

    // Para cada nivel, distribuir evaluadores equitativamente
    const results: string[] = [];
    // Almacenar asignaciones por nivel para redistribución posterior
    const assignmentsByLevel = new Map<number, Array<{ teamId: number; jurorIds: string[] }>>();
    // Rastrear qué jurados/profesores ya han sido asignados a algún nivel
    const assignedEvaluators = new Set<string>();

    // IMPORTANTE: Primero inicializar TODOS los equipos de TODOS los niveles,
    // incluso si no hay evaluadores disponibles inicialmente
    for (const [level, levelTeams] of teamsByLevel.entries()) {
      const assignments: Array<{ teamId: number; jurorIds: string[] }> = [];
      
      for (const team of levelTeams) {
        // Obtener jurados ya asignados al equipo (solo del rol correcto)
        const roleId = level === 0 ? this.professorRoleId : this.jurorRoleId;
        const currentAssignedJurors = team.assignedJurors
          .filter(j => j.roleId === roleId)
          .map(j => j.id)
          .filter((id, index, self) => self.indexOf(id) === index); // Eliminar duplicados
        
        assignments.push({
          teamId: team.id,
          jurorIds: [...currentAssignedJurors]
        });
      }
      
      assignmentsByLevel.set(level, assignments);
    }

    // Ahora procesar cada nivel para asignar evaluadores
    for (const [level, levelTeams] of teamsByLevel.entries()) {
      // Para nivel 0 (colegios), usar profesores; para otros niveles, usar jurados
      // Usar filterEvaluatorsByLevel para obtener solo los que no tienen asignaciones de otros niveles
      let currentEvaluators: Map<string, number>;
      if (level === 0) {
        // Nivel 0: usar profesores que no tienen asignaciones de otros niveles
        currentEvaluators = await this.filterEvaluatorsByLevel(allProfessorsMap, 0, true);
      } else {
        // Otros niveles: usar jurados que no tienen asignaciones de nivel 0 u otros niveles
        currentEvaluators = await this.filterEvaluatorsByLevel(allJurors, level, false);
      }
      
      // Filtrar evaluadores que ya fueron asignados en esta ejecución a otro nivel
      const filteredEvaluators = new Map<string, number>();
      for (const [id, count] of currentEvaluators.entries()) {
        if (!assignedEvaluators.has(id)) {
          filteredEvaluators.set(id, count);
        }
      }
      
      currentEvaluators = filteredEvaluators;

      // Ordenar evaluadores por carga actual (menos evaluaciones primero)
      // Esto asegura que los evaluadores con menos carga se asignen primero
      let sortedEvaluators = Array.from(currentEvaluators.entries()).sort((a, b) => a[1] - b[1]);

      const availableEvaluatorsCount = sortedEvaluators.length;

      if (availableEvaluatorsCount === 0) {
        const evaluatorType = level === 0 ? 'profesores' : 'jurados';
        results.push(`Nivel ${level}: No hay ${evaluatorType} disponibles inicialmente (se intentará asignar después)`);
        // NO hacer continue - los equipos ya están inicializados en assignmentsByLevel
        // Continuar al siguiente nivel para que los evaluadores puedan redistribuirse después
        continue;
      }

      // Obtener las asignaciones ya inicializadas para este nivel
      const assignments = assignmentsByLevel.get(level) || [];

      // CONSTANTES: Mínimo 4 jurados por equipo, 3-5 equipos por jurado
      // Distribución equitativa: cada jurado debe tener entre 3 y 5 equipos
      const MAX_JURORS_PER_TEAM = 4; // Máximo 4 jurados por equipo
      const MAX_TEAMS_PER_JUROR = 5; // Máximo 5 equipos por jurado
      const MIN_TEAMS_PER_JUROR = 3; // Mínimo 3 equipos por jurado
      const MIN_JURORS_PER_TEAM = 4; // Mínimo 4 jurados por equipo
      const totalTeams = levelTeams.length;
      
      // Las asignaciones ya están inicializadas arriba, se obtienen de assignmentsByLevel
      
      // ESTRATEGIA SIMPLE: Distribución equitativa directa
      // Calcular asignaciones necesarias
      const totalRequiredAssignments = totalTeams * MIN_JURORS_PER_TEAM;
      const availableSlots = availableEvaluatorsCount * MAX_TEAMS_PER_JUROR;
      
      if (totalRequiredAssignments > availableSlots) {
        const evaluatorType = level === 0 ? 'profesores' : 'jurados';
        this.logger.warn(
          `Nivel ${level}: ADVERTENCIA - Puede no haber suficientes ${evaluatorType}. ` +
          `Se necesitan ${totalRequiredAssignments} asignaciones pero solo hay ${availableSlots} disponibles ` +
          `(${availableEvaluatorsCount} ${evaluatorType} × ${MAX_TEAMS_PER_JUROR} equipos máximo por ${evaluatorType === 'jurados' ? 'jurado' : 'profesor'}). ` +
          `Se intentará asignar lo máximo posible.`
        );
      }
      
      this.logger.log(
        `Nivel ${level}: Distribuyendo ${totalTeams} equipos entre ${availableEvaluatorsCount} evaluadores. ` +
        `Se necesitan ${totalRequiredAssignments} asignaciones (${MIN_JURORS_PER_TEAM} jurados × ${totalTeams} equipos)`
      );
      
      // Crear lista de evaluadores con su carga actual (ordenados por carga, menor primero)
      let evaluatorList = Array.from(currentEvaluators.entries())
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => a.count - b.count);
      
      
      let assignmentIndex = 0; // Índice para distribuir asignaciones
      
      // Primera pasada: Asignar a todos los equipos hasta que tengan MIN_JURORS_PER_TEAM
      for (let teamIdx = 0; teamIdx < totalTeams; teamIdx++) {
        const assignment = assignments[teamIdx];
        const needed = MIN_JURORS_PER_TEAM - assignment.jurorIds.length;
        
        if (needed <= 0) continue;
        
        // Asignar jurados disponibles, distribuyendo equitativamente
        for (let i = 0; i < needed; i++) {
          // Seleccionar el jurado con menos equipos asignados
          evaluatorList.sort((a, b) => a.count - b.count);
          
          // Buscar un jurado disponible que:
          // 1. No haya alcanzado el máximo de equipos
          // 2. NO esté ya asignado a este equipo (evitar duplicados)
          const availableJuror = evaluatorList.find(j => 
            j.count < MAX_TEAMS_PER_JUROR && 
            !assignment.jurorIds.includes(j.id) // IMPORTANTE: Verificar que no esté ya en el equipo
          );
          
          if (availableJuror) {
            assignment.jurorIds.push(availableJuror.id);
            availableJuror.count++;
            currentEvaluators.set(availableJuror.id, availableJuror.count);
            if (level !== 0) {
              allJurors.set(availableJuror.id, availableJuror.count);
            }
            assignmentIndex++;
          } else {
            // Si no hay disponibles que cumplan las condiciones, buscar cualquiera que no esté en el equipo
            const anyJuror = evaluatorList.find(j => !assignment.jurorIds.includes(j.id));
            if (anyJuror) {
              assignment.jurorIds.push(anyJuror.id);
              anyJuror.count++;
              currentEvaluators.set(anyJuror.id, anyJuror.count);
              if (level !== 0) {
                allJurors.set(anyJuror.id, anyJuror.count);
              }
            } else {
              // No hay más jurados disponibles que no estén ya en este equipo
              break;
            }
          }
        }
      }
      
      // Segunda pasada: Distribuir equitativamente para que cada jurado tenga al menos MIN_TEAMS_PER_JUROR
      // Identificar jurados con menos del mínimo
      let jurorsWithLessThanMin = evaluatorList.filter(j => j.count < MIN_TEAMS_PER_JUROR);
      
      while (jurorsWithLessThanMin.length > 0) {
        let progressMade = false;
        
        for (const juror of jurorsWithLessThanMin) {
          const needed = MIN_TEAMS_PER_JUROR - juror.count;
          if (needed <= 0) continue;
          
          // Buscar equipos donde este jurado pueda ser asignado
          // IMPORTANTE: Verificar que el jurado NO esté ya en el equipo
          const teamsAvailable = assignments.filter(a => 
            a.jurorIds.length < MAX_JURORS_PER_TEAM && // Equipo con espacio
            !a.jurorIds.includes(juror.id) // Verificar que el jurado no esté ya en el equipo
          );
          
          // Asignar a los primeros equipos disponibles
          for (let i = 0; i < Math.min(needed, teamsAvailable.length); i++) {
            // Verificar nuevamente que no esté ya asignado (por seguridad)
            if (teamsAvailable[i].jurorIds.includes(juror.id)) {
        continue;
      }
      
            teamsAvailable[i].jurorIds.push(juror.id);
            juror.count++;
            currentEvaluators.set(juror.id, juror.count);
            if (level !== 0) {
              allJurors.set(juror.id, juror.count);
            }
            progressMade = true;
            
            if (juror.count >= MIN_TEAMS_PER_JUROR) break;
          }
        }
        
        if (!progressMade) break;
        
        jurorsWithLessThanMin = evaluatorList.filter(j => j.count < MIN_TEAMS_PER_JUROR);
      }
      
      // Verificar equipos que aún no tienen suficientes jurados
      const teamsStillNeedingJurors = assignments.filter(a => a.jurorIds.length < MIN_JURORS_PER_TEAM);
      if (teamsStillNeedingJurors.length > 0) {
        this.logger.error(
          `Nivel ${level}: ${teamsStillNeedingJurors.length} equipo(s) aún no tienen el mínimo de ${MIN_JURORS_PER_TEAM} jurados: ` +
          teamsStillNeedingJurors.map(t => `Equipo ${t.teamId} (${t.jurorIds.length} jurados)`).join(', ')
        );
      }
      
      
      // Verificar que ningún equipo tenga más jurados de los permitidos
      for (const assignment of assignments) {
        if (assignment.jurorIds.length > MAX_JURORS_PER_TEAM) {
          this.logger.warn(
            `Equipo ${assignment.teamId} tiene ${assignment.jurorIds.length} jurados, ` +
            `limitando a ${MAX_JURORS_PER_TEAM}`
          );
          // Mantener solo los primeros MAX_JURORS_PER_TEAM jurados
          assignment.jurorIds = assignment.jurorIds.slice(0, MAX_JURORS_PER_TEAM);
        }
      }
      
      // Recalcular la carga de los evaluadores después de limitar los equipos
      currentEvaluators.clear();
      for (const assignment of assignments) {
        for (const jurorId of assignment.jurorIds) {
          currentEvaluators.set(jurorId, (currentEvaluators.get(jurorId) || 0) + 1);
        }
      }
      
      // Verificar que todos los jurados asignados a este nivel tengan al menos 1 equipo
      // Si hay jurados sin equipos, asignarlos a equipos que tienen menos de 4 jurados
      const jurorsWithoutTeams = Array.from(currentEvaluators.entries())
        .filter(([_, count]) => count === 0)
        .map(([id]) => id);
      
      if (jurorsWithoutTeams.length > 0) {
            this.logger.warn(
          `Nivel ${level}: ${jurorsWithoutTeams.length} jurado(s) no tienen equipos asignados. Asignándolos...`
        );
        
        // Asignar estos jurados a equipos que tienen menos de MAX_JURORS_PER_TEAM
        for (const jurorId of jurorsWithoutTeams) {
          const teamsWithSpace = assignments.filter(a => 
            a.jurorIds.length < MAX_JURORS_PER_TEAM && 
            !a.jurorIds.includes(jurorId)
          );
          
          if (teamsWithSpace.length > 0) {
            // Asignar a los primeros equipos disponibles
            for (let i = 0; i < Math.min(1, teamsWithSpace.length); i++) {
              teamsWithSpace[i].jurorIds.push(jurorId);
              currentEvaluators.set(jurorId, (currentEvaluators.get(jurorId) || 0) + 1);
              if (level !== 0) {
                allJurors.set(jurorId, (allJurors.get(jurorId) || 0) + 1);
              }
            }
          }
        }
      }
      
      // Verificar nuevamente equipos que aún no tienen suficientes jurados
      const teamsStillNeedingAfterRecalc = assignments.filter(a => a.jurorIds.length < MIN_JURORS_PER_TEAM);
      if (teamsStillNeedingAfterRecalc.length > 0) {
        this.logger.warn(
          `Nivel ${level}: ${teamsStillNeedingAfterRecalc.length} equipo(s) aún necesitan jurados después de recalcular. ` +
          `Intentando asignar jurados disponibles...`
        );
        
        // Buscar jurados que pueden recibir más equipos
        const availableJurors = Array.from(currentEvaluators.entries())
          .filter(([id, count]) => {
            // Jurados que no han alcanzado el máximo O jurados sin equipos
            return count < MAX_TEAMS_PER_JUROR || count === 0;
          })
          .sort((a, b) => a[1] - b[1]); // Priorizar los que tienen menos equipos
        
        for (const assignment of teamsStillNeedingAfterRecalc) {
          const stillNeeded = MIN_JURORS_PER_TEAM - assignment.jurorIds.length;
          
          for (let i = 0; i < stillNeeded && i < availableJurors.length; i++) {
            const [jurorId, currentCount] = availableJurors[i];
            
            // Verificar que el jurado no esté ya asignado a este equipo
            if (assignment.jurorIds.includes(jurorId)) {
            continue;
          }
          
            // Verificar que el equipo no exceda el máximo
            if (assignment.jurorIds.length >= MAX_JURORS_PER_TEAM) {
              break;
            }
            
            assignment.jurorIds.push(jurorId);
            const newCount = currentCount + 1;
            currentEvaluators.set(jurorId, newCount);
          if (level !== 0) {
              allJurors.set(jurorId, newCount);
            }
            
            // Actualizar en la lista de disponibles
            availableJurors[i][1] = newCount;
            availableJurors.sort((a, b) => a[1] - b[1]);
          }
        }
      }
      
      // PASO INTERMEDIO CRÍTICO: Asegurar que todos los jurados tengan al menos MIN_TEAMS_PER_JUROR equipos
      // Identificar jurados con menos del mínimo requerido
      let evaluatorsNeedingTeams = Array.from(currentEvaluators.entries())
        .filter(([_, count]) => count < MIN_TEAMS_PER_JUROR)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => a.count - b.count); // Priorizar los que tienen menos equipos
      
      this.logger.log(
        `Nivel ${level}: Asegurando mínimo de ${MIN_TEAMS_PER_JUROR} equipos por jurado. ` +
        `${evaluatorsNeedingTeams.length} jurado(s) por debajo del mínimo.`
      );
      
      // Asignar equipos adicionales a jurados que tienen menos del mínimo
      let attempts = 0;
      const maxAttempts = totalTeams * 2; // Límite de seguridad
      
      while (evaluatorsNeedingTeams.length > 0 && attempts < maxAttempts) {
        attempts++;
        let progressMade = false;
        
        for (const evaluator of evaluatorsNeedingTeams) {
          const teamsNeeded = MIN_TEAMS_PER_JUROR - evaluator.count;
          
          if (teamsNeeded <= 0) {
          continue;
        }
        
          // Buscar equipos que puedan recibir a este jurado adicional
          // Priorizar equipos con menos jurados (3 jurados) sobre los que tienen 4
          // También considerar equipos con 4 jurados si alguno de ellos tiene muchos equipos (>4)
          const availableTeams = assignments
            .filter(assignment => {
              if (assignment.jurorIds.includes(evaluator.id)) return false;
              
              // Si el equipo tiene menos de 4 jurados, está disponible
              if (assignment.jurorIds.length < MAX_JURORS_PER_TEAM) {
                return true;
              }
              
              // Si el equipo tiene 4 jurados, verificar si alguno tiene muchos equipos y podría ser reemplazado
              if (assignment.jurorIds.length === MAX_JURORS_PER_TEAM) {
                return assignment.jurorIds.some(jurorId => {
                  const otherCount = currentEvaluators.get(jurorId) || 0;
                  return otherCount > MIN_TEAMS_PER_JUROR; // Otro jurado tiene más de 4 equipos
                });
              }
              
              return false;
            })
            .sort((a, b) => {
              // Priorizar equipos con menos jurados
              if (a.jurorIds.length !== b.jurorIds.length) {
                return a.jurorIds.length - b.jurorIds.length;
              }
              return 0;
            });
          
          // Asignar a los equipos disponibles hasta alcanzar el mínimo
          const teamsToAssign = Math.min(teamsNeeded, availableTeams.length, MAX_TEAMS_PER_JUROR - evaluator.count);
          
          for (let i = 0; i < teamsToAssign && i < availableTeams.length; i++) {
            const assignment = availableTeams[i];
            
            // Si el equipo tiene menos de 4 jurados, agregar directamente
            if (assignment.jurorIds.length < MAX_JURORS_PER_TEAM) {
              assignment.jurorIds.push(evaluator.id);
              evaluator.count++;
              currentEvaluators.set(evaluator.id, evaluator.count);
              if (level !== 0) {
                allJurors.set(evaluator.id, evaluator.count);
              }
              progressMade = true;
            }
            // Si el equipo tiene 4 jurados, reemplazar uno que tenga muchos equipos
            else if (assignment.jurorIds.length === MAX_JURORS_PER_TEAM) {
              // Buscar un jurado en este equipo que tenga más de 4 equipos
              for (let j = 0; j < assignment.jurorIds.length; j++) {
                const otherJurorId = assignment.jurorIds[j];
                const otherCount = currentEvaluators.get(otherJurorId) || 0;
                
                // Si el otro jurado tiene más de 4 equipos, reemplazarlo
                if (otherCount > MIN_TEAMS_PER_JUROR) {
                  assignment.jurorIds[j] = evaluator.id;
                  
                  currentEvaluators.set(otherJurorId, otherCount - 1);
                  if (level !== 0) {
                    allJurors.set(otherJurorId, (allJurors.get(otherJurorId) || 0) - 1);
                  }
                  
                  evaluator.count++;
                  currentEvaluators.set(evaluator.id, evaluator.count);
                  if (level !== 0) {
                    allJurors.set(evaluator.id, evaluator.count);
                  }
                  progressMade = true;
                  break;
                }
              }
            }
            
            // Si alcanzó el mínimo, detener para este evaluador
            if (evaluator.count >= MIN_TEAMS_PER_JUROR) {
              break;
            }
          }
          
          // Si este evaluador alcanzó el mínimo, ya no necesitamos procesarlo
          if (evaluator.count >= MIN_TEAMS_PER_JUROR) {
            break;
          }
        }
        
        if (!progressMade) {
          // No se puede hacer más progreso
          break;
        }
        
        // Recalcular la lista de evaluadores por debajo del mínimo
        evaluatorsNeedingTeams = Array.from(currentEvaluators.entries())
          .filter(([_, count]) => count < MIN_TEAMS_PER_JUROR)
          .map(([id, count]) => ({ id, count }))
          .sort((a, b) => a.count - b.count);
      }
      
      if (evaluatorsNeedingTeams.length > 0) {
          this.logger.warn(
          `Nivel ${level}: Después de intentar asegurar el mínimo, ${evaluatorsNeedingTeams.length} jurado(s) ` +
          `aún tiene(n) menos de ${MIN_TEAMS_PER_JUROR} equipos. Esto puede deberse a que no hay suficientes equipos.`
        );
      } else {
        this.logger.log(
          `Nivel ${level}: ✓ Todos los jurados tienen al menos ${MIN_TEAMS_PER_JUROR} equipos asignados.`
        );
      }
      
      // Segundo paso: Redistribuir para maximizar el uso de evaluadores
      // Calcular cuántos equipos debería tener cada evaluador para distribución equitativa
      const totalAssignmentsNeeded = totalTeams * MIN_JURORS_PER_TEAM;
      const idealTeamsPerEvaluator = Math.ceil(totalAssignmentsNeeded / availableEvaluatorsCount);
      // Asegurar que el objetivo sea al menos MIN_TEAMS_PER_JUROR si es posible
      const targetTeamsPerEvaluator = Math.min(
        Math.max(idealTeamsPerEvaluator, MIN_TEAMS_PER_JUROR),
        MAX_TEAMS_PER_JUROR
      );
      
      this.logger.log(
        `Nivel ${level}: Objetivo de redistribución - ` +
        `cada evaluador debería tener entre ${MIN_TEAMS_PER_JUROR} y ${targetTeamsPerEvaluator} equipos ` +
        `(mínimo: ${MIN_TEAMS_PER_JUROR}, máximo: ${MAX_TEAMS_PER_JUROR}, máximo por equipo: ${MAX_JURORS_PER_TEAM})`
      );
      
      // Redistribución inteligente: reasignar jurados para balancear la carga
      let redistributionRounds = 0;
      const maxRedistributionRounds = 10;
      
      while (redistributionRounds < maxRedistributionRounds) {
        // Ordenar evaluadores por carga
        evaluatorList.sort((a, b) => a.count - b.count);
        
        // Encontrar evaluadores con menos equipos (menos del mínimo o menos del objetivo)
        const evaluatorsWithFewTeams = evaluatorList.filter(e => 
          e.count < MIN_TEAMS_PER_JUROR || 
          (e.count < targetTeamsPerEvaluator && e.count < MAX_TEAMS_PER_JUROR)
        );
        
        // Evaluadores con más equipos que el objetivo o más que el máximo ideal
        const evaluatorsWithManyTeams = evaluatorList.filter(e => 
          e.count > targetTeamsPerEvaluator
        );
        
        // Si no hay evaluadores con pocos equipos, verificar si todos tienen al menos el mínimo
        if (evaluatorsWithFewTeams.length === 0) {
          const allHaveMinimum = evaluatorList.every(e => e.count >= MIN_TEAMS_PER_JUROR);
          if (allHaveMinimum) {
            this.logger.log(
              `Nivel ${level}: Todos los evaluadores tienen al menos ${MIN_TEAMS_PER_JUROR} equipos`
            );
            break;
          }
        }
        
        if (evaluatorsWithFewTeams.length === 0 && evaluatorsWithManyTeams.length === 0) {
          // Distribución balanceada alcanzada
          break;
        }
        
        let progressMade = false;
        
        // Intentar mover asignaciones de evaluadores con muchos equipos a evaluadores con pocos equipos
        evaluatorsWithFewTeams.sort((a, b) => {
          const aBelowMin = a.count < MIN_TEAMS_PER_JUROR ? 1 : 0;
          const bBelowMin = b.count < MIN_TEAMS_PER_JUROR ? 1 : 0;
          if (aBelowMin !== bBelowMin) return bBelowMin - aBelowMin;
          return a.count - b.count;
        });
        
        for (const evaluatorWithFew of evaluatorsWithFewTeams) {
          const teamsNeededForMinimum = Math.max(0, MIN_TEAMS_PER_JUROR - evaluatorWithFew.count);
          const teamsNeededForTarget = Math.max(0, targetTeamsPerEvaluator - evaluatorWithFew.count);
          
          // Primero intentar reemplazar: encontrar equipos asignados a evaluadores con muchos equipos
          for (const assignment of assignments) {
            if (assignment.jurorIds.length >= MIN_JURORS_PER_TEAM && 
                assignment.jurorIds.length < MAX_JURORS_PER_TEAM &&
                !assignment.jurorIds.includes(evaluatorWithFew.id)) {
              
              const overloadedEvaluatorId = assignment.jurorIds.find(jurorId => {
                const evaluator = evaluatorList.find(e => e.id === jurorId);
                return evaluator && evaluator.count > targetTeamsPerEvaluator;
              });
              
              if (overloadedEvaluatorId) {
                const index = assignment.jurorIds.indexOf(overloadedEvaluatorId);
                assignment.jurorIds[index] = evaluatorWithFew.id;
                
                const overloadedEvaluator = evaluatorList.find(e => e.id === overloadedEvaluatorId);
                if (overloadedEvaluator) {
                  overloadedEvaluator.count--;
                  currentEvaluators.set(overloadedEvaluatorId, overloadedEvaluator.count);
                  if (level !== 0) {
                    allJurors.set(overloadedEvaluatorId, overloadedEvaluator.count);
                  }
                }
                
                evaluatorWithFew.count++;
                currentEvaluators.set(evaluatorWithFew.id, evaluatorWithFew.count);
                if (level !== 0) {
                  allJurors.set(evaluatorWithFew.id, evaluatorWithFew.count);
                }
                
                progressMade = true;
                
                if (evaluatorWithFew.count >= targetTeamsPerEvaluator) {
                  break;
                }
                if (evaluatorWithFew.count >= MIN_TEAMS_PER_JUROR && teamsNeededForMinimum === 0) {
                  if (evaluatorsWithFewTeams.some(e => e.count < MIN_TEAMS_PER_JUROR && e.id !== evaluatorWithFew.id)) {
                    break;
                  }
                }
              }
            }
          }
          
          // Si aún necesita más equipos, intentar agregar como jurado adicional
          const stillNeedsTeams = evaluatorWithFew.count < MIN_TEAMS_PER_JUROR || 
                                  (evaluatorWithFew.count < targetTeamsPerEvaluator && evaluatorWithFew.count < MAX_TEAMS_PER_JUROR);
          
          if (stillNeedsTeams) {
            const teamsForAdditionalJuror = assignments.filter(assignment =>
              assignment.jurorIds.length >= MIN_JURORS_PER_TEAM &&
              assignment.jurorIds.length < MAX_JURORS_PER_TEAM &&
              !assignment.jurorIds.includes(evaluatorWithFew.id)
            );
            
            const targetForThisEvaluator = evaluatorWithFew.count < MIN_TEAMS_PER_JUROR 
              ? MIN_TEAMS_PER_JUROR 
              : targetTeamsPerEvaluator;
              
            const additionalTeamsNeeded = Math.min(
              targetForThisEvaluator - evaluatorWithFew.count,
              MAX_TEAMS_PER_JUROR - evaluatorWithFew.count,
              teamsForAdditionalJuror.length
            );
            
            for (let j = 0; j < additionalTeamsNeeded; j++) {
              const assignment = teamsForAdditionalJuror[j];
              assignment.jurorIds.push(evaluatorWithFew.id);
              evaluatorWithFew.count++;
              currentEvaluators.set(evaluatorWithFew.id, evaluatorWithFew.count);
              if (level !== 0) {
                allJurors.set(evaluatorWithFew.id, evaluatorWithFew.count);
              }
              progressMade = true;
              
              if (evaluatorWithFew.count >= targetTeamsPerEvaluator) {
                break;
              }
              if (evaluatorWithFew.count >= MIN_TEAMS_PER_JUROR && 
                  evaluatorsWithFewTeams.some(e => e.count < MIN_TEAMS_PER_JUROR && e.id !== evaluatorWithFew.id)) {
                break;
              }
            }
          }
        }
        
        if (!progressMade) {
          break;
        }
        
        redistributionRounds++;
      }
      
      // Log de distribución final
      const finalDistribution = evaluatorList.map(e => e.count);
      const minTeams = finalDistribution.length > 0 ? Math.min(...finalDistribution) : 0;
      const maxTeams = finalDistribution.length > 0 ? Math.max(...finalDistribution) : 0;
      const avgTeams = finalDistribution.length > 0 
        ? (finalDistribution.reduce((a, b) => a + b, 0) / finalDistribution.length).toFixed(1)
        : '0';
      
      const evaluatorsWithMaxTeams = evaluatorList.filter(e => e.count >= MAX_TEAMS_PER_JUROR).length;
      const evaluatorsWithMinTeams = evaluatorList.filter(e => e.count >= MIN_TEAMS_PER_JUROR).length;
      const evaluatorsBelowMinimum = evaluatorList.filter(e => e.count < MIN_TEAMS_PER_JUROR);
      const teamsWithCorrectJurors = assignments.filter(a => a.jurorIds.length === MIN_JURORS_PER_TEAM).length;
      
      this.logger.log(
        `Nivel ${level}: Distribución final - ` +
        `Mín: ${minTeams}, Máx: ${maxTeams}, Promedio: ${avgTeams} equipos por evaluador. ` +
        `${evaluatorsWithMinTeams}/${evaluatorList.length} evaluadores con al menos ${MIN_TEAMS_PER_JUROR} equipos ` +
        `(${evaluatorsBelowMinimum.length} por debajo del mínimo). ` +
        `${evaluatorsWithMaxTeams}/${evaluatorList.length} evaluadores con ${MAX_TEAMS_PER_JUROR} equipos. ` +
        `${teamsWithCorrectJurors}/${totalTeams} equipos con ${MIN_JURORS_PER_TEAM} jurados`
      );
      
      if (evaluatorsBelowMinimum.length > 0) {
        this.logger.error(
          `Nivel ${level}: ❌ ERROR: ${evaluatorsBelowMinimum.length} evaluador(es) tiene(n) menos de ${MIN_TEAMS_PER_JUROR} equipos. ` +
          `Esto puede deberse a que no hay suficientes equipos o evaluadores para una distribución óptima. ` +
          `Jurados afectados: ${evaluatorsBelowMinimum.map(e => `ID:${e.id} (${e.count} equipos)`).join(', ')}`
        );
      } else {
        this.logger.log(
          `Nivel ${level}: ✅ ÉXITO: Todos los ${evaluatorList.length} jurados tienen al menos ${MIN_TEAMS_PER_JUROR} equipos asignados.`
        );
      }
      
      // PRIORIDAD ABSOLUTA: Verificar que todos los equipos tengan al menos MIN_JURORS_PER_TEAM evaluadores
      // Esta es la prioridad más alta, incluso si significa que algunos jurados excedan el máximo
      const teamsWithoutEnoughEvaluators = assignments.filter(a => a.jurorIds.length < MIN_JURORS_PER_TEAM);
      if (teamsWithoutEnoughEvaluators.length > 0) {
        this.logger.error(
          `🚨 CRÍTICO: ${teamsWithoutEnoughEvaluators.length} equipo(s) del nivel ${level} ` +
          `no tienen el mínimo de ${MIN_JURORS_PER_TEAM} evaluadores asignados. ` +
          `Priorizando asignar jurados a estos equipos.`
        );
        
        // Intentar asignar evaluadores adicionales como último recurso
        // NO respetar MAX_TEAMS_PER_JUROR si es necesario para completar equipos
        for (const assignment of teamsWithoutEnoughEvaluators) {
          const stillNeeded = MIN_JURORS_PER_TEAM - assignment.jurorIds.length;
          
          if (stillNeeded <= 0) {
            continue;
          }
          
          this.logger.error(`  - Equipo ID ${assignment.teamId} tiene solo ${assignment.jurorIds.length} evaluadores (necesita ${MIN_JURORS_PER_TEAM})`);
          
          // Primero intentar con evaluadores que no han alcanzado el máximo
          let sortedEvaluators = Array.from(currentEvaluators.entries())
            .filter(([evaluatorId]) => !assignment.jurorIds.includes(evaluatorId))
            .sort((a, b) => a[1] - b[1]); // Priorizar los que tienen menos carga
          
          // Si no hay suficientes, usar cualquiera disponible (incluso los que exceden el máximo)
          let assigned = 0;
          for (let i = 0; i < stillNeeded && i < sortedEvaluators.length; i++) {
            // Verificar que el equipo no exceda el límite
            if (assignment.jurorIds.length >= MAX_JURORS_PER_TEAM) {
              break;
            }
            
            const [evaluatorId, currentLoad] = sortedEvaluators[i];
            
            assignment.jurorIds.push(evaluatorId);
            const newLoad = currentLoad + 1;
            currentEvaluators.set(evaluatorId, newLoad);
            if (level !== 0) {
              allJurors.set(evaluatorId, newLoad);
            }
            assigned++;
          }
          
          if (assigned < stillNeeded) {
            this.logger.error(
              `  - Solo se pudieron asignar ${assigned} de ${stillNeeded} evaluadores necesarios al equipo ${assignment.teamId}`
            );
          }
        }
        
        // Recalcular después de esta asignación de emergencia
        currentEvaluators.clear();
        for (const assignment of assignments) {
          for (const jurorId of assignment.jurorIds) {
            currentEvaluators.set(jurorId, (currentEvaluators.get(jurorId) || 0) + 1);
          }
        }
      }
      
      // VERIFICACIÓN FINAL ABSOLUTA: Asegurar que NINGÚN jurado tenga menos de 4 equipos ANTES de guardar
      // Recalcular la carga final
      currentEvaluators.clear();
      for (const assignment of assignments) {
        for (const jurorId of assignment.jurorIds) {
          currentEvaluators.set(jurorId, (currentEvaluators.get(jurorId) || 0) + 1);
        }
      }
      
      let jurorsWithLessThan4 = Array.from(currentEvaluators.entries())
        .filter(([_, count]) => count < MIN_TEAMS_PER_JUROR)
        .map(([id, count]) => ({ id, count }));
      
      if (jurorsWithLessThan4.length > 0) {
        this.logger.error(
          `🚨 VERIFICACIÓN FINAL: ${jurorsWithLessThan4.length} jurado(s) tiene(n) menos de ${MIN_TEAMS_PER_JUROR} equipos. ` +
          `Forzando corrección final agresiva...`
        );
        
        // Último intento: redistribución ultra agresiva
        for (const juror of jurorsWithLessThan4) {
          const teamsNeeded = MIN_TEAMS_PER_JUROR - juror.count;
          
          for (const assignment of assignments) {
            if (juror.count >= MIN_TEAMS_PER_JUROR) break;
            
            if (assignment.jurorIds.length === MAX_JURORS_PER_TEAM && 
                !assignment.jurorIds.includes(juror.id)) {
              
              for (let i = 0; i < assignment.jurorIds.length; i++) {
                const otherJurorId = assignment.jurorIds[i];
                const otherJurorCount = currentEvaluators.get(otherJurorId) || 0;
                
                if (otherJurorCount > MIN_TEAMS_PER_JUROR) {
                  assignment.jurorIds[i] = juror.id;
                  currentEvaluators.set(otherJurorId, otherJurorCount - 1);
                  if (level !== 0) {
                    allJurors.set(otherJurorId, (allJurors.get(otherJurorId) || 0) - 1);
                  }
                  juror.count++;
                  currentEvaluators.set(juror.id, juror.count);
                  if (level !== 0) {
                    allJurors.set(juror.id, juror.count);
                  }
                  break;
                }
              }
            }
            else if (assignment.jurorIds.length < MAX_JURORS_PER_TEAM && 
                     !assignment.jurorIds.includes(juror.id)) {
              assignment.jurorIds.push(juror.id);
              juror.count++;
              currentEvaluators.set(juror.id, juror.count);
              if (level !== 0) {
                allJurors.set(juror.id, juror.count);
              }
              
              if (juror.count >= MIN_TEAMS_PER_JUROR) {
                break;
              }
            }
          }
        }
        
        currentEvaluators.clear();
        for (const assignment of assignments) {
          for (const jurorId of assignment.jurorIds) {
            currentEvaluators.set(jurorId, (currentEvaluators.get(jurorId) || 0) + 1);
          }
        }
        jurorsWithLessThan4 = Array.from(currentEvaluators.entries())
          .filter(([_, count]) => count < MIN_TEAMS_PER_JUROR)
          .map(([id, count]) => ({ id, count }));
      }
      
      // VERIFICACIÓN FINAL CRÍTICA: Asegurar que ningún equipo tenga más jurados de los permitidos
      let teamsExceedingLimit = 0;
      for (const assignment of assignments) {
        if (assignment.jurorIds.length > MAX_JURORS_PER_TEAM) {
          teamsExceedingLimit++;
          this.logger.error(
            `ERROR CRÍTICO: Equipo ${assignment.teamId} tiene ${assignment.jurorIds.length} jurados, ` +
            `limitando a ${MAX_JURORS_PER_TEAM}`
          );
          assignment.jurorIds = assignment.jurorIds.slice(0, MAX_JURORS_PER_TEAM);
        }
      }
      
      if (teamsExceedingLimit > 0) {
        currentEvaluators.clear();
        for (const assignment of assignments) {
          for (const jurorId of assignment.jurorIds) {
            currentEvaluators.set(jurorId, (currentEvaluators.get(jurorId) || 0) + 1);
          }
        }
      }
      
      // ELIMINAR DUPLICADOS: Asegurar que ningún jurado esté dos veces en el mismo equipo
      for (const assignment of assignments) {
        const uniqueJurorIds = [...new Set(assignment.jurorIds)]; // Eliminar duplicados
        if (uniqueJurorIds.length !== assignment.jurorIds.length) {
          const duplicatesRemoved = assignment.jurorIds.length - uniqueJurorIds.length;
          this.logger.warn(
            `Equipo ${assignment.teamId} tenía ${duplicatesRemoved} jurado(s) duplicado(s). Eliminados.`
          );
        }
        assignment.jurorIds = uniqueJurorIds;
      }
      
      // VERIFICACIÓN FINAL COMPLETA: Asegurar que todos los equipos tengan jurados Y todos los jurados tengan equipos
      // Recalcular la carga final de todos los jurados
      currentEvaluators.clear();
      for (const assignment of assignments) {
        for (const jurorId of assignment.jurorIds) {
          currentEvaluators.set(jurorId, (currentEvaluators.get(jurorId) || 0) + 1);
        }
      }
      
      // Identificar jurados asignados al nivel que no tienen equipos
      const allJurorsForLevel = currentEvaluators;
      const jurorsWithoutAnyTeams = Array.from(allJurorsForLevel.keys())
        .filter(jurorId => (currentEvaluators.get(jurorId) || 0) === 0);
      
      // Identificar equipos sin suficientes jurados
      const finalTeamsWithoutEnoughEvaluators = assignments.filter(a => a.jurorIds.length < MIN_JURORS_PER_TEAM);
      
      // Si hay jurados sin equipos y equipos sin jurados, redistribuir
      if (jurorsWithoutAnyTeams.length > 0 || finalTeamsWithoutEnoughEvaluators.length > 0) {
        this.logger.warn(
          `Nivel ${level}: Verificación final - ${jurorsWithoutAnyTeams.length} jurado(s) sin equipos, ` +
          `${finalTeamsWithoutEnoughEvaluators.length} equipo(s) sin suficientes jurados. Redistribuyendo...`
        );
        
        // Asignar jurados sin equipos a equipos que necesitan más jurados
        for (const jurorId of jurorsWithoutAnyTeams) {
          const teamsNeedingJurors = assignments
            .filter(a => 
              a.jurorIds.length < MIN_JURORS_PER_TEAM && 
              !a.jurorIds.includes(jurorId) &&
              a.jurorIds.length < MAX_JURORS_PER_TEAM
            )
            .sort((a, b) => a.jurorIds.length - b.jurorIds.length);
          
          if (teamsNeedingJurors.length > 0) {
            teamsNeedingJurors[0].jurorIds.push(jurorId);
            currentEvaluators.set(jurorId, (currentEvaluators.get(jurorId) || 0) + 1);
            if (level !== 0) {
              allJurors.set(jurorId, (allJurors.get(jurorId) || 0) + 1);
            }
          }
        }
        
        // Reintentar asignar a equipos que aún no tienen suficientes jurados
        const teamsStillNeeding = assignments.filter(a => a.jurorIds.length < MIN_JURORS_PER_TEAM);
        if (teamsStillNeeding.length > 0) {
          const allAvailableJurors = Array.from(allJurorsForLevel.keys())
            .map(id => ({ id, count: currentEvaluators.get(id) || 0 }))
            .sort((a, b) => a.count - b.count);
          
          for (const assignment of teamsStillNeeding) {
            let stillNeeded = MIN_JURORS_PER_TEAM - assignment.jurorIds.length;
            
            for (const juror of allAvailableJurors) {
              if (stillNeeded <= 0) break;
              if (assignment.jurorIds.length >= MAX_JURORS_PER_TEAM) break;
              if (assignment.jurorIds.includes(juror.id)) continue;
              if (juror.count >= MAX_TEAMS_PER_JUROR) continue;
              
              assignment.jurorIds.push(juror.id);
              juror.count++;
              currentEvaluators.set(juror.id, juror.count);
              if (level !== 0) {
                allJurors.set(juror.id, juror.count);
              }
              stillNeeded--;
            }
          }
        }
      }
      
      // Verificación final después de redistribución
      const finalTeamsWithoutEnough = assignments.filter(a => a.jurorIds.length < MIN_JURORS_PER_TEAM).length;
      const finalJurorsWithoutTeams = Array.from(allJurorsForLevel.keys())
        .filter(jurorId => (currentEvaluators.get(jurorId) || 0) === 0).length;
      const teamsWithCorrectCount = assignments.filter(a => a.jurorIds.length === MAX_JURORS_PER_TEAM).length;
      
      if (finalTeamsWithoutEnough === 0 && finalJurorsWithoutTeams === 0) {
        this.logger.log(
          `✓ Todos los equipos del nivel ${level} tienen al menos ${MIN_JURORS_PER_TEAM} evaluadores ` +
          `y todos los jurados tienen al menos 1 equipo asignado ` +
          `(${teamsWithCorrectCount}/${totalTeams} equipos con exactamente ${MAX_JURORS_PER_TEAM} jurados)`
        );
      } else {
        if (finalTeamsWithoutEnough > 0) {
          this.logger.error(
            `✗ ERROR: ${finalTeamsWithoutEnough} equipo(s) del nivel ${level} ` +
            `aún no tienen el mínimo de ${MIN_JURORS_PER_TEAM} evaluadores asignados`
          );
        }
        if (finalJurorsWithoutTeams > 0) {
          this.logger.error(
            `✗ ERROR: ${finalJurorsWithoutTeams} jurado(s) del nivel ${level} ` +
            `aún no tienen ningún equipo asignado`
          );
        }
      }
      
      // Guardar asignaciones del nivel para redistribución posterior
      assignmentsByLevel.set(level, assignments.map(a => ({ ...a })));
      
      // Marcar todos los evaluadores asignados en este nivel como utilizados
      for (const assignment of assignments) {
        for (const jurorId of assignment.jurorIds) {
          assignedEvaluators.add(jurorId);
        }
      }

      // Calcular estadísticas para el mensaje
      const minEvaluators = Math.min(...assignments.map(a => a.jurorIds.length));
      const maxEvaluators = Math.max(...assignments.map(a => a.jurorIds.length));
      const avgEvaluators = (assignments.reduce((sum, a) => sum + a.jurorIds.length, 0) / assignments.length).toFixed(1);
      const teamsWithMinEvaluators = assignments.filter(a => a.jurorIds.length >= MIN_JURORS_PER_TEAM).length;
      
      const evaluatorType = level === 0 ? 'profesores' : 'jurados';
      
      if (teamsWithMinEvaluators === totalTeams) {
        if (minEvaluators === maxEvaluators) {
          results.push(
            `Nivel ${level}: ${totalTeams} equipos asignados con ${minEvaluators} ${evaluatorType} cada uno (mínimo cumplido)`,
          );
        } else {
          results.push(
            `Nivel ${level}: ${totalTeams} equipos asignados (${minEvaluators}-${maxEvaluators} ${evaluatorType} por equipo, promedio: ${avgEvaluators}, mínimo cumplido)`,
          );
        }
      } else {
        results.push(
          `Nivel ${level}: ${teamsWithMinEvaluators}/${totalTeams} equipos con mínimo de ${MIN_JURORS_PER_TEAM} ${evaluatorType} ` +
          `(${minEvaluators}-${maxEvaluators} ${evaluatorType} por equipo, promedio: ${avgEvaluators})`,
        );
      }
    }

    // VERIFICACIÓN FINAL COMPLETA: Contar equipos totales y jurados totales
    const totalTeamsCount = teams.length;
    const totalJurorsCount = allJurors.size;
    const totalProfessorsCount = (await this.getJurors(true)).size;
    
    this.logger.log(`📊 RESUMEN TOTAL: ${totalTeamsCount} equipos, ${totalJurorsCount} jurados, ${totalProfessorsCount} profesores`);
    
    // Contar equipos con jurados asignados y jurados con equipos asignados
    let teamsWithJurors = 0;
    let teamsWithoutJurors = 0;
    const allAssignedJurorIds = new Set<string>();
    
    for (const [level, assignments] of assignmentsByLevel.entries()) {
      for (const assignment of assignments) {
        if (assignment.jurorIds.length > 0) {
          teamsWithJurors++;
          for (const jurorId of assignment.jurorIds) {
            allAssignedJurorIds.add(jurorId);
          }
        } else {
          teamsWithoutJurors++;
        }
      }
    }
    
    this.logger.log(
      `📊 Estado actual: ${teamsWithJurors}/${totalTeamsCount} equipos con jurados, ` +
      `${allAssignedJurorIds.size} jurados con equipos asignados`
    );
    
    if (teamsWithoutJurors > 0) {
      this.logger.error(
        `❌ PROBLEMA: ${teamsWithoutJurors} equipo(s) sin jurados asignados. Corrigiendo...`
      );
    }
    
    // Identificar jurados sin equipos
    const jurorsWithoutTeams = Array.from(allJurors.keys())
      .filter(jurorId => !allAssignedJurorIds.has(jurorId));
    
    if (jurorsWithoutTeams.length > 0) {
      this.logger.warn(
        `⚠️ ADVERTENCIA: ${jurorsWithoutTeams.length} jurado(s) sin equipos asignados: ${jurorsWithoutTeams.slice(0, 5).join(', ')}${jurorsWithoutTeams.length > 5 ? '...' : ''}`
      );
    }

    // REDISTRIBUCIÓN ENTRE NIVELES: Mover jurados sin asignaciones a otros niveles con espacios
    this.logger.log(`Iniciando redistribución de jurados entre niveles...`);
    
    const MIN_JURORS_PER_TEAM_REDIST = 4; // Mínimo de jurados por equipo
    const MAX_JURORS_PER_TEAM_REDIST = 4; // Máximo de jurados por equipo
    const jurorsWithoutAssignmentsByLevel = new Map<number, string[]>();
    
    // Obtener todos los evaluadores originales por nivel para comparar
    const allEvaluatorsByLevel = new Map<number, Map<string, number>>();
    for (const [level, _] of teamsByLevel.entries()) {
      if (level === 0) {
        const professors = await this.filterEvaluatorsByLevel(allProfessorsMap, 0, true);
        allEvaluatorsByLevel.set(level, professors);
      } else {
        const jurors = await this.filterEvaluatorsByLevel(allJurors, level, false);
        allEvaluatorsByLevel.set(level, jurors);
      }
    }
    
    for (const [level, assignments] of assignmentsByLevel.entries()) {
      const allJurorsForLevel = allEvaluatorsByLevel.get(level) || new Map<string, number>();
      
      // Contar asignaciones de cada jurado en este nivel
      const jurorAssignments = new Map<string, number>();
      for (const assignment of assignments) {
        for (const jurorId of assignment.jurorIds) {
          jurorAssignments.set(jurorId, (jurorAssignments.get(jurorId) || 0) + 1);
        }
      }
      
      // Identificar jurados sin asignaciones
      const jurorsWithoutAssignments = Array.from(allJurorsForLevel.keys())
        .filter(jurorId => (jurorAssignments.get(jurorId) || 0) === 0);
      
      if (jurorsWithoutAssignments.length > 0) {
        jurorsWithoutAssignmentsByLevel.set(level, jurorsWithoutAssignments);
        this.logger.log(
          `Nivel ${level}: ${jurorsWithoutAssignments.length} jurado(s) sin asignaciones que pueden redistribuirse`
        );
      }
    }
    
    // Redistribuir jurados sin asignaciones a otros niveles con espacios disponibles
    for (const [sourceLevel, unassignedJurors] of jurorsWithoutAssignmentsByLevel.entries()) {
      const isProfessorLevel = sourceLevel === 0;
      const targetLevels = isProfessorLevel 
        ? Array.from(teamsByLevel.keys()).filter(l => l === 0)
        : Array.from(teamsByLevel.keys()).filter(l => l !== 0 && l !== sourceLevel);
      
      for (const jurorId of unassignedJurors) {
        let assigned = false;
        
        // Intentar asignar a otros niveles
        for (const targetLevel of targetLevels) {
          const targetAssignments = assignmentsByLevel.get(targetLevel);
          if (!targetAssignments) continue;
          
          // Buscar equipos que necesitan más jurados
          const teamsNeedingJurors = targetAssignments.filter(a => 
            a.jurorIds.length < MIN_JURORS_PER_TEAM_REDIST &&
            !a.jurorIds.includes(jurorId) &&
            a.jurorIds.length < MAX_JURORS_PER_TEAM_REDIST
          );
          
          if (teamsNeedingJurors.length > 0) {
            // Asignar a los equipos que más lo necesitan
            teamsNeedingJurors.sort((a, b) => a.jurorIds.length - b.jurorIds.length);
            
            for (const team of teamsNeedingJurors) {
              if (team.jurorIds.length >= MIN_JURORS_PER_TEAM_REDIST) break;
              
              team.jurorIds.push(jurorId);
              assigned = true;
              
              this.logger.log(
                `  - Jurado ${jurorId} movido del nivel ${sourceLevel} al nivel ${targetLevel}, ` +
                `asignado al equipo ${team.teamId}`
              );
              
              break;
            }
            
            if (assigned) break;
          }
        }
        
        if (!assigned) {
          this.logger.warn(
            `  - Jurado ${jurorId} del nivel ${sourceLevel} no pudo ser redistribuido (no hay espacios disponibles en otros niveles)`
          );
        }
      }
    }
    
    // Contar TODOS los equipos procesados y verificar que coincidan con el total
    const MIN_JURORS_REQUIRED = 4;
    const MIN_JURORS_PER_TEAM = 4;
    let totalTeamsProcessed = 0;
    let finalTeamsWithoutJurors = 0;
    let finalTeamsWithInsufficientJurors = 0;
    let finalJurorsWithoutTeams = 0;
    
    const allAssignedJurorIdsFinal = new Set<string>();
    
    for (const [level, assignments] of assignmentsByLevel.entries()) {
      for (const assignment of assignments) {
        totalTeamsProcessed++;
        if (assignment.jurorIds.length === 0) {
          finalTeamsWithoutJurors++;
        } else if (assignment.jurorIds.length < MIN_JURORS_REQUIRED) {
          finalTeamsWithInsufficientJurors++;
        }
        
        for (const jurorId of assignment.jurorIds) {
          allAssignedJurorIdsFinal.add(jurorId);
        }
      }
    }
    
    if (totalTeamsProcessed !== totalTeamsCount) {
      this.logger.error(
        `❌ ERROR CRÍTICO: Se procesaron ${totalTeamsProcessed} equipos pero se esperaban ${totalTeamsCount} equipos en total. ` +
        `Faltan ${totalTeamsCount - totalTeamsProcessed} equipo(s) por procesar.`
      );
    }
    
    const finalJurorsWithoutTeamsList = Array.from(allJurors.keys())
      .filter(jurorId => !allAssignedJurorIdsFinal.has(jurorId));
    finalJurorsWithoutTeams = finalJurorsWithoutTeamsList.length;
    
    const totalProblems = finalTeamsWithoutJurors + finalTeamsWithInsufficientJurors + finalJurorsWithoutTeams;
    
    if (totalProblems === 0 && totalTeamsProcessed === totalTeamsCount) {
      this.logger.log(
        `✅ VERIFICACIÓN FINAL EXITOSA: Todos los ${totalTeamsCount} equipos tienen al menos ${MIN_JURORS_REQUIRED} jurados y todos los ${totalJurorsCount} jurados tienen equipos asignados`
      );
      results.push(
        `✅ Verificación final: Todos los ${totalTeamsCount} equipos tienen al menos ${MIN_JURORS_REQUIRED} jurados y todos los ${totalJurorsCount} jurados tienen equipos asignados`
      );
    } else {
      let errorMsg = `❌ ERROR: Después de todas las correcciones: `;
      const errors = [];
      if (totalTeamsProcessed !== totalTeamsCount) {
        errors.push(`${totalTeamsCount - totalTeamsProcessed} equipo(s) no fueron procesados`);
      }
      if (finalTeamsWithoutJurors > 0) {
        errors.push(`${finalTeamsWithoutJurors} equipo(s) sin jurados`);
      }
      if (finalTeamsWithInsufficientJurors > 0) {
        errors.push(`${finalTeamsWithInsufficientJurors} equipo(s) con menos de ${MIN_JURORS_REQUIRED} jurados`);
      }
      if (finalJurorsWithoutTeams > 0) {
        errors.push(`${finalJurorsWithoutTeams} jurado(s) sin equipos`);
      }
      errorMsg += errors.join(', ');
      this.logger.error(errorMsg);
      results.push(`⚠️ Advertencia: ${errors.join(', ')}`);
    }
    
    // Log final de redistribución
    const redistributedCount = Array.from(jurorsWithoutAssignmentsByLevel.values())
      .reduce((sum, jurors) => sum + jurors.length, 0);
    
    if (redistributedCount > 0) {
      results.push(
        `Redistribución entre niveles: ${redistributedCount} jurado(s) redistribuido(s) a otros niveles`
      );
    }

    // VERIFICACIÓN FINAL: Eliminar duplicados de todos los equipos antes de guardar
    this.logger.log(`🔍 Verificación final: Eliminando duplicados de todos los equipos...`);
    let totalDuplicatesRemoved = 0;
    
    for (const [level, assignments] of assignmentsByLevel.entries()) {
      for (const assignment of assignments) {
        const originalLength = assignment.jurorIds.length;
        const uniqueJurorIds = [...new Set(assignment.jurorIds)]; // Eliminar duplicados
        const duplicatesRemoved = originalLength - uniqueJurorIds.length;
        
        if (duplicatesRemoved > 0) {
          totalDuplicatesRemoved += duplicatesRemoved;
          this.logger.warn(
            `Equipo ${assignment.teamId} (Nivel ${level}) tenía ${duplicatesRemoved} jurado(s) duplicado(s). Eliminados.`
          );
        }
        
        assignment.jurorIds = uniqueJurorIds;
      }
    }
    
    if (totalDuplicatesRemoved > 0) {
      this.logger.warn(`⚠️ Total de duplicados eliminados: ${totalDuplicatesRemoved}`);
    }

    // Guardar todas las asignaciones finales en la base de datos
    this.logger.log(`💾 Guardando asignaciones finales en la base de datos...`);
    
    for (const [level, assignments] of assignmentsByLevel.entries()) {
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
    }
    
    // RESUMEN FINAL COMPLETO: Calcular estadísticas detalladas
    const finalTotalTeams = Array.from(assignmentsByLevel.values())
      .reduce((sum, assignments) => sum + assignments.length, 0);
    const finalTotalJurorsAssigned = new Set<string>();
    
    for (const assignments of assignmentsByLevel.values()) {
      for (const assignment of assignments) {
        for (const jurorId of assignment.jurorIds) {
          finalTotalJurorsAssigned.add(jurorId);
        }
      }
    }
    
    const finalJurorLoadMap = new Map<string, number>();
    const levelSummary = new Map<number, { teams: number, teamsWith4Jurors: number, teamsWith3Jurors: number, teamsWithLess: number }>();
    
    for (const [level, assignments] of assignmentsByLevel.entries()) {
      let teamsCount = 0;
      let teamsWith4Jurors = 0;
      let teamsWith3Jurors = 0;
      let teamsWithLess = 0;
      
      for (const assignment of assignments) {
        teamsCount++;
        const jurorCount = assignment.jurorIds.length;
        
        if (jurorCount >= 4) {
          teamsWith4Jurors++;
        } else if (jurorCount === 3) {
          teamsWith3Jurors++;
        } else {
          teamsWithLess++;
        }
        
        for (const jurorId of assignment.jurorIds) {
          finalJurorLoadMap.set(jurorId, (finalJurorLoadMap.get(jurorId) || 0) + 1);
        }
      }
      
      levelSummary.set(level, { teams: teamsCount, teamsWith4Jurors, teamsWith3Jurors, teamsWithLess });
    }
    
    // Estadísticas de carga de jurados
    const jurorLoadDistribution = {
      with3: 0,
      with4: 0,
      with5: 0,
      withMore: 0,
      withLess: 0,
    };
    
    for (const count of finalJurorLoadMap.values()) {
      if (count === 3) jurorLoadDistribution.with3++;
      else if (count === 4) jurorLoadDistribution.with4++;
      else if (count === 5) jurorLoadDistribution.with5++;
      else if (count > 5) jurorLoadDistribution.withMore++;
      else if (count < 3) jurorLoadDistribution.withLess++;
    }
    
    // Construir resumen final detallado
    results.push('');
    results.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    results.push('📊 RESUMEN FINAL DE ASIGNACIONES');
    results.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    results.push(`Total de equipos asignados: ${finalTotalTeams}`);
    results.push(`Total de jurados/profesores asignados: ${finalTotalJurorsAssigned.size}`);
    results.push('');
    
    // Resumen por nivel
    results.push('📋 Distribución por nivel:');
    const sortedLevels = Array.from(levelSummary.entries()).sort((a, b) => a[0] - b[0]);
    for (const [level, stats] of sortedLevels) {
      const levelName = level === 0 ? 'Profesores (Nivel 0)' : `Nivel ${level}`;
      results.push(
        `  ${levelName}: ${stats.teams} equipos ` +
        `(${stats.teamsWith4Jurors} con 4 jurados, ${stats.teamsWith3Jurors} con 3 jurados, ${stats.teamsWithLess} con menos de 3)`
      );
    }
    results.push('');
    
    // Carga de jurados
    results.push('⚖️ Carga de jurados:');
    results.push(`  Jurados con 3 equipos: ${jurorLoadDistribution.with3}`);
    results.push(`  Jurados con 4 equipos: ${jurorLoadDistribution.with4}`);
    results.push(`  Jurados con 5 equipos: ${jurorLoadDistribution.with5}`);
    if (jurorLoadDistribution.withMore > 0) {
      results.push(`  Jurados con más de 5 equipos: ${jurorLoadDistribution.withMore}`);
    }
    if (jurorLoadDistribution.withLess > 0) {
      results.push(`  Jurados con menos de 3 equipos: ${jurorLoadDistribution.withLess}`);
    }
    results.push('');
    
    // Estado final
    const totalJurorsWithOptimalLoad = jurorLoadDistribution.with3 + jurorLoadDistribution.with4 + jurorLoadDistribution.with5;
    const optimalLoadPercentage = finalTotalJurorsAssigned.size > 0 
      ? Math.round((totalJurorsWithOptimalLoad / finalTotalJurorsAssigned.size) * 100) 
      : 0;
    
    results.push(`✅ Estado: ${optimalLoadPercentage}% de jurados tienen carga óptima (3-5 equipos)`);
    results.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
      message: "Evaluaciones asignadas correctamente",
      details: results,
    };
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
                { roleId: this.professorRoleId }
              ]
            },
            select: { 
              id: true,
              roleId: true
            }
          },
          videogame: {
            select: {
              id: true,
              name: true,
              videogameStatusId: true,
            }
          }
        }
      });
      
      // Filtrar solo los equipos con videojuegos confirmados
      const teams = allTeams.filter(team => 
        team.videogame?.videogameStatusId === this.confirmedStatusId
      );
      
      // Contar equipos con evaluadores asignados
      const teamsWithEvaluators = teams.filter(t => t.assignedJurors.length > 0).length;
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
        `Distribución por nivel: ${levelSummary || 'N/A'}`
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
          email: {
            not: 'profesorcolegios@uninorte.edu.co' // Excluir este profesor específico
          }
        },
        select: {
          id: true,
          email: true,
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
          message: 'No hay asignaciones de evaluadores (jurados o profesores) para eliminar',
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

      this.logger.log(`Se eliminaron ${assignmentCount} asignaciones de evaluadores (jurados o profesores)`);
      
      return {
        message: 'Todas las asignaciones de evaluadores (jurados o profesores) han sido eliminadas correctamente',
        asignacionesEliminadas: assignmentCount,
      };
    } catch (error) {
      this.logger.error('Error al eliminar todas las asignaciones de evaluadores:', error);
      throw new InternalServerErrorException('Error al eliminar todas las asignaciones de evaluadores');
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
        throw new NotFoundException('Evaluador (jurado o profesor) no encontrado o inactivo');
      }

      // Validar que sea jurado o profesor
      if (evaluator.roleId !== this.jurorRoleId && evaluator.roleId !== this.professorRoleId) {
        throw new BadRequestException('El usuario no es un jurado ni un profesor');
      }

      const assignedTeams = evaluator.teamsToEvaluate;
      const assignmentCount = assignedTeams.length;

      if (assignmentCount === 0) {
        return {
          message: 'El evaluador (jurado o profesor) no tiene asignaciones para eliminar',
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

      this.logger.log(`Se eliminaron ${assignmentCount} asignaciones del evaluador ${jurorId}`);
      
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
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error al eliminar todas las asignaciones del evaluador:', error);
      throw new InternalServerErrorException('Error al eliminar todas las asignaciones del evaluador');
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
        throw new NotFoundException('Evaluador (jurado o profesor) no encontrado o inactivo');
      }

      // Validar que sea jurado o profesor
      if (evaluator.roleId !== this.jurorRoleId && evaluator.roleId !== this.professorRoleId) {
        throw new BadRequestException('El usuario no es un jurado ni un profesor');
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
      const isAssigned = team.assignedJurors.some(j => j.id === jurorId);
      if (!isAssigned) {
        throw new NotFoundException('El evaluador (jurado o profesor) no está asignado a este equipo');
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
        throw new NotFoundException('Equipo no encontrado después de la desasignación');
      }

      this.logger.log(`Se eliminó la asignación del evaluador ${jurorId} del equipo ${teamId}`);

      return {
        message: 'Evaluador (jurado o profesor) desasignado correctamente del equipo',
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
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error al desasignar jurado del equipo:', error);
      throw new InternalServerErrorException('Error al desasignar jurado del equipo');
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

      const assignedJurorIds = team.assignedJurors.map(j => j.id);

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
      this.logger.error('Error al obtener estadísticas de evaluación del equipo:', error);
      throw new InternalServerErrorException('Error al obtener estadísticas de evaluación del equipo');
    }
  }

}
