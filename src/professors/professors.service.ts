import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { EditionStatus, Prisma, User, Role, NRC, Subject } from '@prisma/client';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { SelectOption } from './types/select-option.type';
import { Response } from 'express';
import { ExcelExportService, NrcSheetData } from './excel-export.service';

@Injectable()
export class ProfessorsService {
  private readonly logger = new Logger(ProfessorsService.name);
  private readonly PROFESSOR_ROLE_NAME = 'Profesor';

  private professorRoleId: number;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly excelExport: ExcelExportService,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'Initializing Professor module: Fetching Professor role id',
    );

    try {
      const professorRole: Role | null = await this.prisma.role.findUnique({
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
    } catch (error) {
      if (error instanceof Error)
        this.logger.error(
          `Failed to initialize professor role id: ${error.message}`,
          error.stack,
        );
      throw error;
    }
  }

  async create(createProfessorDto: CreateProfessorDto): Promise<User> {
    this.logger.log(
      `Attempting to create professor with email: ${createProfessorDto.email}`,
    );

    const existingUserByEmailInLocalDB = await this.prisma.user.findUnique({
      where: { email: createProfessorDto.email },
    });

    if (existingUserByEmailInLocalDB) {
      this.logger.warn(
        `User with email ${createProfessorDto.email} already exists in local DB with ID ${existingUserByEmailInLocalDB.id}.`,
      );
      throw new ConflictException(
        `The email ${createProfessorDto.email} is already in use.`,
      );
    }

    let user: User;
    try {
      user = await this.authService.registerUser({
        email: createProfessorDto.email,
      });

      if (!user || !user.id) {
        this.logger.error(
          `User registration failed or did not return a user ID for email: ${createProfessorDto.email}`,
        );
        throw new InternalServerErrorException(
          'User registration failed at authentication provider.',
        );
      }
      this.logger.log(
        `User registered successfully: ${user.id} for email ${createProfessorDto.email}`,
      );
    } catch (error) {
      let errorMessage = 'Unknown error during registration.';
      let errorStack: string | undefined;

      if (error instanceof ConflictException) {
        throw new ConflictException(
          `The email ${createProfessorDto.email} is already registered with the authentication provider.`,
        );
      }

      if (error instanceof Error) {
        errorMessage = error.message;
        errorStack = error.stack;
        this.logger.error(
          `Error during registration for ${createProfessorDto.email}: ${errorMessage}`,
          errorStack,
        );
      } else {
        this.logger.error(
          `Non-Error thrown during registration for ${createProfessorDto.email}: ${String(error)}`,
        );
      }
      throw new InternalServerErrorException(
        `An error occurred with the authentication provider during registration: ${errorMessage}`,
      );
    }

    try {
      const newProfessor = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: createProfessorDto.firstName,
          lastName: createProfessorDto.lastName,
          roleId: this.professorRoleId,
          isActive: true,
        },
      });
      this.logger.log(
        `Professor created successfully in local DB: ${newProfessor.id} (ID: ${user.id})`,
      );
      return newProfessor;
    } catch (error) {
      let message = `Error creating professor profile in local DB for ${createProfessorDto.email} (ID: ${user.id})`;
      let stack: string | undefined;

      if (error instanceof Error) {
        message = `${message}: ${error.message}`;
        stack = error.stack;
      }
      this.logger.error(message, stack);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target as string[] | undefined;
        this.logger.error(
          `Prisma unique constraint violation on creating professor: ${target?.join(', ')}`,
        );
        throw new ConflictException(
          `Failed to create professor due to a data conflict on: ${target?.join(', ')}. The user was created but local profile failed. Manual cleanup might be needed.`,
        );
      }

      throw new InternalServerErrorException(
        'Failed to save professor profile locally after successful authentication provider registration.',
      );
    }
  }

  async findForSelect(): Promise<SelectOption[]> {
    const professors = await this.prisma.user.findMany({
      where: { roleId: this.professorRoleId, isActive: true },
      select: { firstName: true, lastName: true, id: true },
    });
    return professors;
  }

  async findAll(
    includeInactive: boolean,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<User>> {
    const offset = (page - 1) * limit;
    const whereClause: Prisma.UserWhereInput = { roleId: this.professorRoleId };
    if (!includeInactive) whereClause.isActive = true;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { lastName: 'asc' },
      }),
      this.prisma.user.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: items,
      metadata: {
        totalItems,
        itemsOnCurrentPage: items.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages,
      },
    };
  }

  async findNrcs(
    professorId: string,
    includeSubjects: boolean,
  ): Promise<NRC[]> {
    const selectOptions: Prisma.NRCSelect = {
      id: true,
      code: true,
      ...(includeSubjects && {
        subject: { select: { id: true, name: true, code: true } },
      }),
    };

    return await this.prisma.nRC.findMany({
      where: { professorId },
      select: selectOptions,
    });
  }

  private async getFinalScoreByVideogameId(
    videogameId: number,
  ): Promise<number | null> {
    if (!videogameId) return null;
    try {
      const row = await this.prisma.teamFinalScore.findFirst({
        where: { videogameId } as any,
      });
      if (!row) return null;
      const val = (row as any).finalScore ?? (row as any).final_score ?? null;
      if (val === null || val === undefined) return null;
      return typeof val === 'number' ? val : parseFloat(String(val));
    } catch (err) {
      this.logger.warn(
        `getFinalScoreByVideogameId error: ${(err as any)?.message}`,
      );
      return null;
    }
  }

  private async getAvgJuniorByVideogameId(
    videogameId: number,
  ): Promise<number | null> {
    if (!videogameId) return null;
    try {
      const row = await this.prisma.teamFinalScore.findFirst({
        where: { videogameId } as any,
      });
      if (!row) return null;
      const val =
        (row as any).avgJunior ??
        (row as any).avg_junior ??
        (row as any).avgjunior ??
        null;
      if (val === null || val === undefined) return null;
      return typeof val === 'number' ? val : parseFloat(String(val));
    } catch (err) {
      this.logger.warn(
        `getAvgJuniorByVideogameId error: ${(err as any)?.message}`,
      );
      return null;
    }
  }

  private async resolveVideogameId(
    teamCode?: string,
    videogameName?: string,
  ): Promise<number | null> {
    try {
      if (teamCode && teamCode !== '') {
        if (!isNaN(Number(teamCode))) {
          const team = await this.prisma.team.findUnique({
            where: { id: Number(teamCode) } as any,
            select: { id: true },
          });
          if (team?.id) {
            const vg = await this.prisma.videogame.findFirst({
              where: { teamId: team.id },
              select: { id: true },
            });
            if (vg?.id) return vg.id;
          }
        }
        const teamByCode = await this.prisma.team.findFirst({
          where: { teamCode: String(teamCode) },
          select: { id: true },
        });
        if (teamByCode?.id) {
          const vg = await this.prisma.videogame.findFirst({
            where: { teamId: teamByCode.id },
            select: { id: true },
          });
          if (vg?.id) return vg.id;
        }
      }
      if (videogameName && videogameName !== '') {
        const vg = await this.prisma.videogame.findFirst({
          where: { name: String(videogameName) },
          select: { id: true },
        });
        if (vg?.id) return vg.id;
      }
    } catch (err) {
      this.logger.warn(`resolveVideogameId error: ${(err as any)?.message}`);
    }
    return null;
  }

  async findSubjects(
    professorId: string,
    includeNrcs: boolean,
  ): Promise<any[]> {
    let subjects;
    if (includeNrcs) {
      subjects = await this.prisma.subject.findMany({
        where: { nrcs: { some: { professorId } } },
        include: {
          nrcs: {
            where: { professorId },
            select: { id: true, code: true, isActive: true },
          },
        },
      });
      subjects = subjects.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        semester: s.semester,
        nrcs: s.nrcs,
      }));
    } else {
      subjects = await this.prisma.subject.findMany({
        where: { nrcs: { some: { professorId } } },
        select: { id: true, name: true, code: true, semester: true },
      });
    }
    return subjects;
  }

  async findOne(id: string): Promise<User> {
    this.logger.log(`Finding professor with ID: ${id}`);
    const professor = await this.prisma.user.findUnique({ where: { id } });

    if (
      !professor ||
      professor.roleId !== this.professorRoleId ||
      !professor.isActive
    ) {
      this.logger.warn(
        `Professor not found, not a professor, or inactive for ID: ${id}`,
      );
      throw new NotFoundException(
        `Professor with ID ${id} not found or is inactive.`,
      );
    }
    return professor;
  }

  async update(
    id: string,
    updateProfessorDto: UpdateProfessorDto,
  ): Promise<User> {
    this.logger.log(`Attempting to update professor with ID: ${id}`);

    const existingProfessor = await this.prisma.user.findUnique({
      where: { id },
    });

    if (
      !existingProfessor ||
      existingProfessor.roleId !== this.professorRoleId
    ) {
      this.logger.warn(
        `Update failed: User ${id} not found or is not a professor.`,
      );
      throw new NotFoundException(
        `Professor with ID ${id} not found or is not a professor role.`,
      );
    }

    try {
      const updatedProfessor = await this.prisma.user.update({
        where: { id },
        data: updateProfessorDto,
      });
      this.logger.log(`Professor ${id} updated successfully.`);
      this.authService.invalidateUserProfileCache(id);
      return updatedProfessor;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target as string[] | undefined;
        throw new ConflictException(
          `Update failed due to unique constraint violation on field(s): ${target?.join(', ')}.`,
        );
      }
      let message = `Failed to update professor ${id}.`;
      let stack: string | undefined;
      if (error instanceof Error) {
        message = `Failed to update professor ${id}: ${error.message}`;
        stack = error.stack;
      }
      this.logger.error(message, stack);
      throw new InternalServerErrorException(
        `Failed to update professor ${id}.`,
      );
    }
  }

  async remove(id: string): Promise<User> {
    this.logger.log(`Attempting to soft delete professor with ID: ${id}`);

    const professor = await this.prisma.user.delete({ where: { id } });

    if (!professor || professor.roleId !== this.professorRoleId) {
      this.logger.warn(
        `Delete failed: User ${id} not found or is not a professor.`,
      );
      throw new NotFoundException(
        `Professor with ID ${id} not found or is not a professor role.`,
      );
    }

    try {
      const deactivatedProfessor = await this.prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
      this.logger.log(`Professor ${id} deleted successfully.`);
      this.authService.invalidateUserProfileCache(id);
      return deactivatedProfessor;
    } catch (error) {
      let message = `Failed to deactivate professor ${id}.`;
      let stack: string | undefined;
      if (error instanceof Error) {
        message = `Failed to deactivate professor ${id}: ${error.message}`;
        stack = error.stack;
      }
      this.logger.error(message, stack);
      throw new InternalServerErrorException(
        `Failed to deactivate professor ${id}.`,
      );
    }
  }

  // [MODIFICACIÓN]: Nuevo método para obtener las evaluaciones del profesor como jurado
  // en equipos universitarios (isExternal = false). Se usa en el panel "Calificaciones Uninorte"
  // para mostrar también los equipos que el profesor evaluó actuando como jurado.
  // [AUTOR]: IA  |  [FECHA]: 27/5/2026
  async getJurorEvaluations(
    professorId: string,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<any>> {
    const offset = (page - 1) * limit;

    // Obtener evaluaciones donde el profesor es el jurado, de equipos universitarios
    const evaluations = await this.prisma.evaluation.findMany({
      where: { jurorId: professorId },
      select: {
        videogameId: true,
        totalScore: true,
        comments: true,
        videogame: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            description: true,
            team: {
              select: {
                id: true,
                teamName: true,
                teamCode: true,
                isExternal: true,
                members: {
                  select: {
                    firstName: true,
                    lastName: true,
                    nrcs: {
                      select: {
                        code: true,
                        subject: { select: { name: true } },
                      },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Filtrar solo equipos universitarios (isExternal = false)
    const universityEvaluations = evaluations.filter(
      (ev) => ev.videogame?.team?.isExternal === false,
    );

    const totalItems = universityEvaluations.length;

    // Aplicar paginación manual
    const pagedEvaluations = universityEvaluations.slice(
      offset,
      offset + limit,
    );

    const data = pagedEvaluations.map((ev) => {
      const videogame = ev.videogame;
      const team = videogame?.team;
      const members = team?.members || [];
      const nrcSet = new Set<number>();
      let firstSubject = 'Sin materia';

      members.forEach((member) => {
        member.nrcs?.forEach((nrc) => {
          nrcSet.add(nrc.code);
          if (firstSubject === 'Sin materia' && nrc.subject?.name) {
            firstSubject = nrc.subject.name;
          }
        });
      });

      return {
        teamCode: team?.teamCode || `JUROR_${videogame?.id || ''}`,
        nrc: Array.from(nrcSet).join(', ') || 'Sin NRC',
        team: team?.teamName ?? 'Sin equipo',
        subject: firstSubject,
        integrantes: members
          .map((m) => `${m.firstName} ${m.lastName}`)
          .join(', '),
        videogame: videogame?.name ?? 'Sin videojuego',
        calificacionFeria: ev.totalScore ?? null,
        calificacionDocente: null, // No aplica evaluación docente para equipos externos al NRC
        videogameId: videogame?.id ?? null,
        isExternal: false,
      };
    });

    return {
      data,
      metadata: {
        totalItems,
        itemsOnCurrentPage: data.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  async getNRCreport(
    nrcCode: number,
    includeInactive: boolean,
    limit: number,
    page: number,
    professorId: string,
  ) {
    const activeEdition = await this.prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    const matchingNrcs = await this.prisma.nRC.findMany({
      where: {
        code: nrcCode,
        professorId,
        ...(activeEdition ? { editionId: activeEdition.id } : { id: -1 }),
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: { id: true, editionId: true },
    });

    if (matchingNrcs.length === 0) {
      throw new NotFoundException(`NRC ${nrcCode} not found for professor`);
    }

    return this.getNrcReportById(
      matchingNrcs[0].id,
      matchingNrcs[0].editionId,
      includeInactive,
      limit,
      page,
      professorId,
    );
  }

  async getNrcReportById(
    nrcId: number,
    editionId: number,
    includeInactive: boolean,
    limit: number,
    page: number,
    professorId: string,
  ) {
    const offset = (page - 1) * limit;
    const activeEdition = await this.prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    if (!activeEdition || editionId !== activeEdition.id) {
      throw new NotFoundException(
        `NRC ${nrcId} does not belong to the active edition`,
      );
    }

    const nrcInfo = await this.prisma.nRC.findFirst({
      where: {
        id: nrcId,
        editionId,
        professorId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        id: true,
        code: true,
        editionId: true,
        edition: { select: { year: true, semester: true } },
        subject: { select: { name: true } },
      },
    });

    if (!nrcInfo)
      throw new NotFoundException(
        `NRC ${nrcId} was not found in edition ${editionId} for professor`,
      );

    const subjectName = nrcInfo.subject.name;

    const teamWhere: Prisma.TeamWhereInput = {
      editionId: nrcInfo.editionId,
      members: {
        some: { nrcs: { some: { id: nrcInfo.id, professorId } } },
      },
    };

    const totalTeams = await this.prisma.team.count({ where: teamWhere });
    let teamRows: any[] = [];

    const teamsFull = await this.prisma.team.findMany({
      where: teamWhere,
      include: {
        members: {
          where: includeInactive ? {} : { isActive: true },
          select: {
            firstName: true,
            lastName: true,
            studentCode: true,
            nrcs: {
              where: { id: nrcInfo.id, professorId },
              select: { code: true, professorId: true },
            },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        },
        videogame: {
          select: {
            id: true,
            name: true,
            evaluations: { select: { totalScore: true } },
          },
        },
      },
      orderBy: { teamName: 'asc' },
      skip: offset,
      take: limit,
    });

    if (teamsFull && teamsFull.length > 0) {
      for (const t of teamsFull) {
        const team: any = t;
        const members = (team.members || []).map(
          (m: any) => `${m.firstName} ${m.lastName}`,
        );
        const nrcSet = new Set<number>();
        for (const m of team.members || []) {
          if (m.nrcs && Array.isArray(m.nrcs)) {
            for (const n of m.nrcs) {
              if (n.code && n.professorId === professorId)
                nrcSet.add(Number(n.code));
            }
          }
        }
        const nrcCodes =
          nrcSet.size > 0
            ? Array.from(nrcSet).join(', ')
            : String(nrcInfo.code);
        const vg = team.videogame;
        let grade: number | null = null;
        if (vg?.id) grade = await this.getFinalScoreByVideogameId(vg.id);
        let calificacionDocente: number | null = null;
        if (vg?.id) {
          const ev = await this.prisma.evaluation.findFirst({
            where: { videogameId: vg.id, jurorId: professorId },
            select: { totalScore: true },
          });
          calificacionDocente = ev?.totalScore ?? null;
        }
        teamRows.push({
          teamCode: team.teamCode ?? team.id,
          nrc: nrcCodes,
          team: t.teamName ?? 'No team',
          subject: subjectName,
          integrantes: members.join(', '),
          videogame: vg?.name ?? 'No videogame',
          calificacionFeria: grade,
          calificacionDocente,
          videogameId: vg?.id ?? null,
          editionId: nrcInfo.editionId,
          nrcId: nrcInfo.id,
        });
      }
    } else {
      const memberWhere: Prisma.MemberWhereInput = {
        nrcs: { some: { id: nrcInfo.id, professorId } },
        team: { is: { editionId: nrcInfo.editionId } },
        ...(includeInactive ? {} : { isActive: true }),
      };

      const members = await this.prisma.member.findMany({
        where: memberWhere,
        select: {
          firstName: true,
          lastName: true,
          studentCode: true,
          team: {
            select: {
              id: true,
              teamCode: true,
              teamName: true,
              videogame: {
                select: {
                  id: true,
                  name: true,
                  evaluations: { select: { totalScore: true } },
                },
              },
            },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });

      const groups = new Map<
        string | number,
        {
          teamCode: string;
          teamName: string;
          videogameName: string;
          videogameId: number | null;
          members: string[];
          grade: number | null;
        }
      >();

      for (const m of members) {
        const teamKey = m.team?.id ?? `no_team_${m.studentCode}`;
        const teamName = m.team?.teamName ?? 'No team';
        const vg = m.team?.videogame;
        if (!groups.has(teamKey as any)) {
          groups.set(teamKey as any, {
            teamCode: (m.team as any)?.teamCode ?? '',
            teamName,
            videogameName: vg?.name ?? 'No videogame',
            videogameId: vg?.id ?? null,
            members: [],
            grade: null,
          });
        }
        const g = groups.get(teamKey as any)!;
        g.members.push(`${m.firstName} ${m.lastName}`);
      }

      for (const [, g] of groups) {
        const vgId =
          g.videogameId ??
          (await this.resolveVideogameId(g.teamCode, g.videogameName));
        if (vgId) {
          g.videogameId = vgId;
          g.grade = await this.getFinalScoreByVideogameId(vgId);
        }
      }

      for (const [, g] of groups) {
        let calificacionDocente: number | null = null;
        if (g.videogameId) {
          const ev = await this.prisma.evaluation.findFirst({
            where: { videogameId: g.videogameId, jurorId: professorId },
            select: { totalScore: true },
          });
          calificacionDocente = ev?.totalScore ?? null;
        }
        teamRows.push({
          teamCode: g.teamCode ?? '',
          nrc: String(nrcInfo.code),
          team: g.teamName,
          subject: subjectName,
          integrantes: g.members.join(', '),
          videogame: g.videogameName,
          calificacionFeria: g.grade,
          calificacionDocente,
          videogameId: g.videogameId ?? null,
          editionId: nrcInfo.editionId,
          nrcId: nrcInfo.id,
        });
      }

      const totalItems = teamRows.length;
      const paged = teamRows.slice(offset, offset + limit);
      return {
        filter: {
          nrcId: nrcInfo.id,
          nrcCode: nrcInfo.code,
          editionId: nrcInfo.editionId,
          year: nrcInfo.edition.year,
          semester: nrcInfo.edition.semester,
        },
        data: paged,
        metadata: {
          totalItems,
          itemsOnCurrentPage: paged.length,
          currentPage: page,
          itemsPerPage: limit,
          totalPages: Math.ceil(totalItems / limit),
        },
      };
    }

    return {
      filter: {
        nrcId: nrcInfo.id,
        nrcCode: nrcInfo.code,
        editionId: nrcInfo.editionId,
        year: nrcInfo.edition.year,
        semester: nrcInfo.edition.semester,
      },
      data: teamRows,
      metadata: {
        totalItems: totalTeams,
        itemsOnCurrentPage: teamRows.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalTeams / limit),
      },
    };
  }

  async GetSignatureReport(
    subjectName: string,
    includeInactive: boolean,
    limit: number,
    page: number,
    professorId: string,
  ) {
    const offset = (page - 1) * limit;
    const teamWhere: Prisma.TeamWhereInput = {
      members: {
        some: {
          nrcs: {
            some: {
              professorId,
              subject: { name: subjectName },
              ...(includeInactive ? {} : { isActive: true }),
            },
          },
        },
      },
    };

    const [teams, totalTeams] = await this.prisma.$transaction([
      this.prisma.team.findMany({
        where: teamWhere,
        include: {
          members: {
            where: includeInactive ? {} : { isActive: true },
            select: {
              firstName: true,
              lastName: true,
              nrcs: {
                where: { professorId, subject: { name: subjectName } },
                select: { code: true },
              },
            },
          },
          videogame: {
            select: {
              id: true,
              name: true,
              evaluations: { select: { totalScore: true } },
            },
          },
        },
        orderBy: { teamName: 'asc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.team.count({ where: teamWhere }),
    ]);

    if (totalTeams === 0) {
      throw new NotFoundException(
        `No teams found for subject "${subjectName}" (Professor: ${professorId}).`,
      );
    }

    const reportData: any[] = [];
    for (const t of teams) {
      const team: any = t;
      const members = (team.members || []).map(
        (m: any) => `${m.firstName} ${m.lastName}`,
      );
      const nrcSet = new Set<string>();
      for (const m of t.members) {
        for (const n of m.nrcs) nrcSet.add(String(n.code));
      }
      const vg = team.videogame;
      let grade: number | null = null;
      if (vg?.id) grade = await this.getFinalScoreByVideogameId(vg.id);
      let calificacionDocente: number | null = null;
      if (vg?.id) {
        const ev = await this.prisma.evaluation.findFirst({
          where: { videogameId: vg.id, jurorId: professorId },
          select: { totalScore: true },
        });
        calificacionDocente = ev?.totalScore ?? null;
      }
      reportData.push({
        teamCode: team.teamCode ?? team.id,
        nrc: Array.from(nrcSet).join(', '),
        team: team.teamName ?? 'No team',
        subject: subjectName,
        integrantes: members.join(', '),
        videogame: vg?.name ?? 'No videojuego',
        calificacionFeria: grade,
        calificacionDocente,
        videogameId: vg?.id ?? null,
      });
    }

    return {
      data: reportData,
      metadata: {
        totalItems: totalTeams,
        itemsOnCurrentPage: teams.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalTeams / limit),
      },
    };
  }

  // ── Excel export ───────────────────────────────────────────────────────────

  private async buildSheets(
    subjects: any[],
    professorId: string,
  ): Promise<NrcSheetData[]> {
    const usedNames = new Set<string>();
    const result: NrcSheetData[] = [];
    const membersCache = new Map<string, any[]>();

    for (const subj of subjects) {
      const subjectName: string = subj.name ?? 'SUBJECT';
      const prefix = ExcelExportService.buildSubjectPrefix(subjectName);
      const nrcs =
        Array.isArray(subj.nrcs) && subj.nrcs.length > 0
          ? subj.nrcs
          : [{ code: 'NO_NRC' }];

      if (!membersCache.has(subjectName)) {
        membersCache.set(
          subjectName,
          await this.fetchMembersForExport(professorId, subjectName),
        );
      }
      const members = membersCache.get(subjectName)!;

      for (const nrc of nrcs) {
        const sheetName = ExcelExportService.buildSheetName(
          prefix,
          nrc.code,
          usedNames,
        );
        const groups = this.groupMembersByTeam(members, String(nrc.code));
        result.push({
          sheetName,
          subjectName,
          nrcCode: String(nrc.code),
          groups,
        });
      }
    }

    return result;
  }

  // ── Excel helpers (used by buildSheets) ───────────────────────────────────

  private async fetchMembersForExport(
    professorId: string,
    subjectName: string,
  ) {
    return await this.prisma.member.findMany({
      where: {
        nrcs: { some: { professorId, subject: { name: subjectName } } },
      },
      select: {
        firstName: true,
        lastName: true,
        studentCode: true,
        email: true,
        team: {
          select: {
            id: true,
            teamCode: true,
            teamName: true,
            videogame: {
              select: {
                id: true,
                name: true,
                evaluations: {
                  where: { jurorId: professorId },
                  select: { totalScore: true },
                },
              },
            },
          },
        },
        nrcs: {
          where: { professorId, subject: { name: subjectName } },
          select: { code: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private groupMembersByTeam(members: any[], currentNrcCode: string) {
    const groups = new Map<
      string | number,
      {
        teamCode: string;
        teamName: string;
        videogameName: string;
        videogameId: number | null;
        nrcCodes: Set<string>;
        members: Set<string>;
        grade: number | null;
        hasNRC: boolean;
      }
    >();

    for (const member of members) {
      const teamKey = member.team?.teamCode ?? `no_team_${member.studentCode}`;
      const teamName = member.team?.teamName ?? 'No team';
      const videogameObj = member.team?.videogame;
      const videogameName = videogameObj?.name ?? 'No videojuego';
      const grade = this.calculateAverageGrade(videogameObj?.evaluations);

      if (!groups.has(teamKey as any)) {
        groups.set(teamKey as any, {
          teamCode: member.team?.teamCode ?? '',
          teamName,
          videogameName,
          videogameId: videogameObj?.id ?? null,
          nrcCodes: new Set<string>(),
          members: new Set<string>(),
          grade,
          hasNRC: false,
        });
      }

      const g = groups.get(teamKey as any)!;
      for (const nrcObj of member.nrcs) {
        if (nrcObj.code) {
          const code = String(nrcObj.code);
          g.nrcCodes.add(code);
          if (code === String(currentNrcCode)) g.hasNRC = true;
        }
      }
      g.members.add(`${member.firstName} ${member.lastName}`);
      if (g.grade === null && grade !== null) g.grade = grade;
      if (!g.videogameId && videogameObj?.id) g.videogameId = videogameObj.id;
    }

    return groups;
  }

  // ── Upload & evaluation ───────────────────────────────────────────────────

  async updateTeamEvaluation(
    videogameId: number,
    professorId: string,
    score: number,
    isSenior: boolean = true,
  ) {
    if (videogameId == null || videogameId === 0) {
      throw new BadRequestException('videogameId is required');
    }
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 5 || Math.abs(Math.round(score * 100) - score * 100) > 1e-8) {
      throw new BadRequestException('Score must be between 0 and 5, with at most two decimal places');
    }

    const videogame = await this.prisma.videogame.findUnique({
      where: { id: videogameId },
    });
    if (!videogame) {
      throw new NotFoundException(`No videogame found for id ${videogameId}`);
    }

    const activeEdition = await this.prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      include: { eventConfiguration: true },
      orderBy: { id: 'desc' },
    });
    const hasProfessorNrc = activeEdition && await this.prisma.team.findFirst({
      where: {
        id: videogame.teamId,
        editionId: activeEdition.id,
        members: { some: { nrcs: { some: { professorId, editionId: activeEdition.id } } } },
      }, select: { id: true },
    });
    if (!activeEdition || !activeEdition.eventConfiguration?.evaluationsOpen || !hasProfessorNrc) {
      throw new BadRequestException('This game is not editable by the authenticated professor in the active edition');
    }
    const editionId = activeEdition.id;

    try {
      const whereUnique = {
        jurado_videojuego_unique: {
          jurorId: professorId,
          videogameId: videogame.id,
        },
      } as any;
      const exists = await this.prisma.evaluation.findUnique({
        where: whereUnique,
      });
      const evaluation = await this.prisma.evaluation.upsert({
        where: whereUnique,
        update: {
          totalScore: score,
          ...(typeof isSenior === 'boolean' ? { isSenior } : {}),
        },
        create: {
          videogameId: videogame.id,
          jurorId: professorId,
          totalScore: score,
          editionId,
          ...(typeof isSenior === 'boolean' ? { isSenior } : {}),
        },
      });
      return { action: exists ? 'updated' : 'created', evaluation };
    } catch (err) {
      this.logger.error(
        `Failed to update/create evaluation for videogameId ${videogameId}: ${(err as any)?.message}`,
      );
      throw new InternalServerErrorException('Failed to save evaluation');
    }
  }

  async getGradingGames(
    professorId: string,
    filters: { page: number; limit: number; editionId?: number; nrcId?: number; team?: string; student?: string; sortBy?: 'student' | 'team'; sortOrder?: 'asc' | 'desc' },
  ) {
    const { page, limit, editionId, nrcId, team, student, sortBy = 'team', sortOrder = 'asc' } = filters;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1) {
      throw new BadRequestException('página/límite inválidos');
    }
    if ((editionId !== undefined && (!Number.isInteger(editionId) || editionId < 1)) ||
      (nrcId !== undefined && (!Number.isInteger(nrcId) || nrcId < 1))) {
      throw new BadRequestException('editionId/nrcId inválido');
    }
    if (!['team', 'student'].includes(sortBy)) throw new BadRequestException('sortBy inválido');
    if (!['asc', 'desc'].includes(sortOrder)) throw new BadRequestException('sortOrder inválido');
    const activeEdition = await this.prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE }, include: { eventConfiguration: true }, orderBy: { id: 'desc' },
    });
    const ownedNrcFilter = { professorId, ...(editionId === undefined ? {} : { editionId }) };
    const teamSearch = team?.trim();
    const studentSearch = student?.trim();
    const currentTeamWhere: Prisma.TeamWhereInput = {
      ...(editionId === undefined ? {} : { editionId }),
      ...(teamSearch ? { OR: [{ teamName: { contains: teamSearch, mode: 'insensitive' as const } }, { teamCode: { contains: teamSearch, mode: 'insensitive' as const } }] } : {}),
      AND: [
        { members: { some: { nrcs: { some: ownedNrcFilter } } } },
        ...(studentSearch ? [{ members: { some: { OR: [
          { firstName: { contains: studentSearch, mode: 'insensitive' as const } },
          { lastName: { contains: studentSearch, mode: 'insensitive' as const } },
          { studentCode: { contains: studentSearch, mode: 'insensitive' as const } },
        ] } } }] : []),
        ...(nrcId === undefined ? [] : [{ members: { some: { nrcs: { some: { id: nrcId, professorId, ...(editionId === undefined ? {} : { editionId }) } } } } }]),
      ],
    };
    const currentTeams = await this.prisma.team.findMany({
      where: currentTeamWhere,
      include: {
        edition: { select: { id: true } },
        members: { select: { firstName: true, lastName: true, studentCode: true, nrcs: { select: { id: true, code: true, professorId: true, editionId: true } } } },
        videogame: { include: { evaluations: { where: { jurorId: professorId }, select: { totalScore: true } } } },
      },
    });
    const rows: any[] = [];
    for (const t of currentTeams) {
      if (!t.videogame) continue;
      const nrcs = new Map<number, { code: number; owned: boolean }>();
      for (const m of t.members) for (const n of m.nrcs) {
        if (n.editionId === t.editionId && n.professorId === professorId) nrcs.set(n.id, { code: n.code, owned: true });
      }
      const matching = [...nrcs.entries()].filter(([id]) => nrcId === undefined || id === nrcId);
      const ownsGameNrc = matching.some(([, n]) => n.owned);
      const nrcLabel = matching.map(([, n]) => n.code).join(', ');
      rows.push({ source: 'current', teamCode: t.teamCode, nrc: nrcLabel || null, team: t.teamName,
        integrantes: t.members.map(m => `${m.firstName} ${m.lastName}`).join(', '), videogame: t.videogame.name,
        videogameId: t.videogame.id, editionId: t.editionId, nrcId: matching.length === 1 ? matching[0][0] : null,
        calificacionFeria: await this.getFinalScoreByVideogameId(t.videogame.id),
        calificacionDocente: t.videogame.evaluations[0]?.totalScore ?? null,
        canEdit: Boolean(activeEdition && activeEdition.id === t.editionId && activeEdition.eventConfiguration?.evaluationsOpen && ownsGameNrc),
      });
    }
    // Historical grading teams are intentionally global for every professor.
    // This read-only view does not filter them by professor ownership, and
    // exposes only names, team metadata and final fair score.
    // NRC identity and code come from the immutable snapshot copied at archive time.
    const historical = await this.prisma.historicalTeam.findMany({
      where: {
        ...(editionId === undefined ? {} : { editionId }),
        ...(teamSearch ? { OR: [{ teamName: { contains: teamSearch, mode: 'insensitive' } }, { teamCode: { contains: teamSearch, mode: 'insensitive' } }] } : {}),
        ...(studentSearch ? { members: { some: { OR: [
          { firstName: { contains: studentSearch, mode: 'insensitive' } }, { lastName: { contains: studentSearch, mode: 'insensitive' } }, { studentCode: { contains: studentSearch, mode: 'insensitive' } },
        ] } } } : {}),
        ...(nrcId === undefined ? {} : { members: { some: { nrcs: { some: { nrcId } } } } }),
      }, include: { members: { include: { nrcs: true } }, videogame: true },
    });
    for (const t of historical) if (t.videogame) {
      const nrcs = new Map<number, number>();
      for (const member of t.members) for (const nrc of member.nrcs) nrcs.set(nrc.nrcId, nrc.code);
      const matching = [...nrcs.entries()].filter(([id]) => nrcId === undefined || id === nrcId);
      rows.push({ source: 'historical', teamCode: t.teamCode, nrc: matching.map(([, code]) => code).join(', ') || null, team: t.teamName,
        integrantes: t.members.map(m => `${m.firstName} ${m.lastName}`).join(', '), videogame: t.videogame.name,
        videogameId: t.videogame.id, editionId: t.editionId, nrcId: matching.length === 1 ? matching[0][0] : null,
        calificacionFeria: t.videogame.finalScore, calificacionDocente: null, canEdit: false });
    }
    const studentSortKey = (row: any) => String(row.integrantes ?? '').split(',').map((name: string) => name.trim()).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(' | ');
    const direction = sortOrder === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const primary = sortBy === 'student'
        ? studentSortKey(a).localeCompare(studentSortKey(b), undefined, { sensitivity: 'base' })
        : String(a.team ?? '').localeCompare(String(b.team ?? ''), undefined, { sensitivity: 'base' });
      return direction * primary || String(a.teamCode).localeCompare(String(b.teamCode), undefined, { numeric: true }) || b.editionId - a.editionId || a.videogameId - b.videogameId;
    });
    const totalItems = rows.length;
    const data = rows.slice((page - 1) * limit, page * limit);
    return { data, metadata: { totalItems, itemsOnCurrentPage: data.length, currentPage: page, itemsPerPage: limit, totalPages: Math.ceil(totalItems / limit) } };
  }

  async getGradingFilterOptions(professorId: string) {
    // Historical NRC options are intentionally not filtered by professor:
    // each professor can browse the global, read-only historical teams view.
    type GradingNrcOption = { id: number; code: number; editionId: number; source: 'current' | 'historical' };
    const nrcs = await this.prisma.nRC.findMany({ where: { professorId }, select: { id: true, code: true, editionId: true } });
    const editionIds = [...new Set(nrcs.map(n => n.editionId))];
    const historical = await this.prisma.historicalMemberNrc.findMany({
      where: { member: { team: { editionId: { in: editionIds } } } },
      select: { nrcId: true, code: true, member: { select: { team: { select: { editionId: true } } } } },
    });
    const editions = await this.prisma.edition.findMany({
      where: { id: { in: editionIds } },
      select: { id: true, year: true, semester: true, title: true }, orderBy: { id: 'desc' },
    });
    const options: GradingNrcOption[] = [
      ...nrcs.map((n): GradingNrcOption => ({ id: n.id, code: n.code, editionId: n.editionId, source: 'current' })),
      ...historical.map((n): GradingNrcOption => ({ id: n.nrcId, code: n.code, editionId: n.member.team.editionId, source: 'historical' })),
    ];
    return { editions, nrcs: options };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private calculateAverageGrade(
    evaluations: { totalScore: number | null }[] | undefined | null,
  ): number | null {
    if (!evaluations || evaluations.length === 0) return null;
    let sum = 0;
    for (const ev of evaluations) {
      if (ev.totalScore !== null) sum += ev.totalScore;
    }
    return sum / evaluations.length;
  }
}
