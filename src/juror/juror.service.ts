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
  private readonly CONFIRMED_STATUS_NAME = "CONFIRMADO";
  private jurorRoleId: number;
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

  async asingEvaluations() {
    const evalByTeam = 3;
    const jurors = await this.getJurors();
    const teams = await this.getTeams();

    if (jurors.size === 0 || teams.length === 0) {
      return {
        message: "No hay jurados o equipos disponibles para asignar evaluaciones",
      };
    }

    for (const team of teams) {

      //const assignedJurorsIDs = team.assignedJurors.map(j => j.id);
      const sortedJurors = Array.from(jurors.entries()).sort((a, b) => a[1] - b[1]);
      //const availableJurors = sortedJurors.filter(([jurorId]) => !assignedJurorsIDs.includes(jurorId));
      //const freeJurors = availableJurors.slice(0, evalByTeam);
      const freeJurors = sortedJurors.slice(0, evalByTeam);

      for (const [jurorId, count] of freeJurors) {
        jurors.set(jurorId, count + 1);
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.team.update({
          where: { id: team.id },
          data: {
            assignedJurors: {
              set: freeJurors.map(([jurorId]) => ({ id: jurorId }))
            }
          }
        });
      })

    }
    return {
      message: "Evaluaciones asignadas correctamente",
    };
  }

  async getTeams() {
    try {
      return await this.prisma.team.findMany({
        where: {
          isActive: true,
          confirmId: this.confirmedStatusId, // Confirmado
        },
        select: {
          id: true,
          assignedJurors: {
            select: { id: true }
          }
        }
      });
    } catch (error) {
      throw new InternalServerErrorException("Error al obtener los equipos");
    }
  }

  async getJurors(): Promise<Map<string, number>> {
    try {
      const jurors = await this.prisma.user.findMany({
        where: {
          isActive: true,
          roleId: this.jurorRoleId, // Rol jurado
        },
        select: {
          id: true,
        }
      });
      // Creamos el Map<juradoId, cantidadEvaluaciones>
      const jurorLoadMap = new Map<string, number>();
      for (const juror of jurors) {
        jurorLoadMap.set(juror.id, 0);
      }

      return jurorLoadMap;
    } catch (error) {
      throw new InternalServerErrorException("Error al obtener los jurados");
    }
  }

  async getEvaluatorsWithTeams(): Promise<any[]> {
    try {
      const evaluators = await this.prisma.user.findMany({
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
          teamsToEvaluate: {
            where: {
              isActive: true,
            },
            select: {
              id: true,
              teamName: true,
              videogame: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          lastName: 'asc',
        },
      });

      return evaluators.map(evaluator => ({
        id: evaluator.id,
        nombre: `${evaluator.firstName} ${evaluator.lastName}`,
        tipo: evaluator.role.name,
        equiposAsignados: evaluator.teamsToEvaluate.map(team => ({
          id: team.id,
          nombre: team.teamName,
          videojuego: team.videogame?.name || null,
        })),
        cantidadEquipos: evaluator.teamsToEvaluate.length,
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

      if (juror.roleId !== this.jurorRoleId) {
        throw new BadRequestException('El usuario no es un jurado');
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

      // Verificar que el jurado no esté ya asignado
      const isAlreadyAssigned = team.assignedJurors.some(j => j.id === jurorId);
      if (isAlreadyAssigned) {
        throw new ConflictException('El jurado ya está asignado a este equipo');
      }

      // Verificar que el equipo no tenga más de 3 jurados (opcional, según requerimientos)
      if (team.assignedJurors.length >= 3) {
        throw new BadRequestException('El equipo ya tiene 3 jurados asignados');
      }

      // Asignar el jurado al equipo
      const updatedTeam = await this.prisma.team.update({
        where: { id: teamId },
        data: {
          assignedJurors: {
            connect: { id: jurorId },
          },
        },
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
        include: {
          assignedJurors: {
            where: {
              isActive: true,
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
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // Filtrar equipos con menos de 3 jurados
      const teamsWithLessThanThree = teams
        .filter(team => team.assignedJurors.length < 3)
        .map(team => ({
          id: team.id,
          nombre: team.teamName,
          videojuego: team.videogame?.name || null,
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

      return teamsWithLessThanThree;
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
