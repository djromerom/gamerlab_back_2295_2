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
import { Prisma, User, Role, NRC, Subject } from '@prisma/client';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { SelectOption } from './types/select-option.type';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';

@Injectable()
export class ProfessorsService {
  private readonly logger = new Logger(ProfessorsService.name);
  private readonly PROFESSOR_ROLE_NAME = 'Profesor';

  private professorRoleId: number;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) { }

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
      where: {
        email: createProfessorDto.email,
      },
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
      // Fallback or re-throw specific error
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

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = error.meta?.target as string[] | undefined;
          this.logger.error(
            `Prisma unique constraint violation on creating professor: ${target?.join(', ')}`,
          );
          throw new ConflictException(
            `Failed to create professor due to a data conflict on: ${target?.join(', ')}. The user was created but local profile failed. Manual cleanup might be needed.`,
          );
        }
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
      this.prisma.user.count({
        where: whereClause,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: items,
      metadata: {
        totalItems: totalItems,
        itemsOnCurrentPage: items.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: totalPages,
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
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      }),
    };

    const nrcs = await this.prisma.nRC.findMany({
      where: { professorId },
      select: selectOptions,
    });

    return nrcs;
  }

  async findSubjects(
    professorId: string,
    includeNrcs: boolean,
  ): Promise<any[]> {
    // Prisma doesn't accept a top-level `where` inside `select` for nested relations
    // in some versions. Use `include` when we need to filter the nested relation
    // (nrcs) and still return subject fields.
    let subjects;
    if (includeNrcs) {
      subjects = await this.prisma.subject.findMany({
        where: {
          nrcs: {
            some: {
              professorId: professorId,
            },
          },
        },
        include: {
          // include the professor's NRCs (may be empty for some subjects)
          nrcs: {
            where: { professorId: professorId },
            select: {
              id: true,
              code: true,
              isActive: true,
            },
          },
        },
      });
      // Map to include only subject fields we want, plus the included nrcs
      subjects = subjects.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        semester: s.semester,
        nrcs: s.nrcs,
      }));
    } else {
      subjects = await this.prisma.subject.findMany({
        where: {
          nrcs: {
            some: {
              professorId: professorId,
            },
          },
        },
        select: {
          id: true,
          name: true,
          code: true,
          semester: true,
        },
      });
    }


    return subjects;
  }

  async findOne(id: string): Promise<User> {
    this.logger.log(`Finding professor with ID: ${id}`);
    const professor = await this.prisma.user.findUnique({
      where: {
        id: id,
      },
    });

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

    if (
      updateProfessorDto.email &&
      updateProfessorDto.email !== existingProfessor.email
    ) {
      this.logger.warn(
        `Attempting to update email for professor ${id}.`,
      );
    }

    try {
      const updatedProfessor = await this.prisma.user.update({
        where: {
          id: id,
        },
        data: updateProfessorDto,
      });
      this.logger.log(`Professor ${id} updated successfully.`);

      this.authService.invalidateUserProfileCache(id);

      return updatedProfessor;
    } catch (error) {
      let message = `Failed to update professor ${id}.`;
      let stack: string | undefined;

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = error.meta?.target as string[] | undefined;
          throw new ConflictException(
            `Update failed due to unique constraint violation on field(s): ${target?.join(', ')}.`,
          );
        }
      }
      if (error instanceof Error) {
        message = `Failed to update professor ${id}: ${error.message}`;
        stack = error.stack;
      }
      this.logger.error(message, stack);
      throw new InternalServerErrorException(
        `Failed to update professor ${id}.`, // Mensaje genérico aquí o el message específico
      );
    }
  }

  async remove(id: string): Promise<User> {
    this.logger.log(`Attempting to soft delete professor with ID: ${id}`);

    const professor = await this.prisma.user.findUnique({
      where: { id: id },
    });

    if (!professor || professor.roleId !== this.professorRoleId) {
      this.logger.warn(
        `Soft delete failed: User ${id} not found or is not a professor.`,
      );
      throw new NotFoundException(
        `Professor with ID ${id} not found or is not a professor role.`,
      );
    }

    if (!professor.isActive) {
      this.logger.warn(
        `Soft delete failed: Professor ${id} is already inactive.`,
      );
      throw new BadRequestException(
        `Professor with ID ${id} is already inactive.`,
      );
    }

    try {
      const deactivatedProfessor = await this.prisma.user.update({
        where: { id: id },
        data: { isActive: false },
      });
      this.logger.log(`Professor ${id} soft deleted successfully.`);

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

  async getNRCreport(
    nrcCode: number,
    includeInactive: boolean,
    limit: number,
    page: number,
    professorId: string,
  ) {
    // return teams-level report: one row per team containing members list and videogame info
    const offset = (page - 1) * limit;

    const nrcInfo = await this.prisma.nRC.findFirst({
      where: {
        code: nrcCode,
        professorId: professorId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        code: true,
        subject: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!nrcInfo) throw new NotFoundException(`NRC ${nrcCode} not found for professor`);

    const subjectName = nrcInfo.subject.name;

    const teamWhere: Prisma.TeamWhereInput = {
      members: {
        some: {
          nrcs: {
            some: {
              code: nrcCode,
              professorId: professorId,
            },
          },
        },
      },
    };

    // Query teams directly (teams that have at least one member in the NRC)
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
              where: { professorId: professorId },
              select: { code: true, professorId: true },
            },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        },
        videogame: {
          select: { id: true, name: true, evaluations: { select: { totalScore: true } } },
        },
      },
      orderBy: { teamName: 'asc' },
      skip: offset,
      take: limit,
    });

    if (teamsFull && teamsFull.length > 0) {
      for (const t of teamsFull) {
        const members = (t.members || []).map((m: any) => `${m.firstName} ${m.lastName}`);
        // Buscar todos los NRCs de este equipo (de sus miembros) con el mismo profesor y materia
        const nrcSet = new Set<number>();
        for (const m of t.members) {
          if (m.nrcs && Array.isArray(m.nrcs)) {
            for (const n of m.nrcs) {
              if (n.code && n.professorId === professorId) nrcSet.add(Number(n.code));
            }
          }
        }
        // Si no se encuentran, usar el nrcCode original
        const nrcCodes = nrcSet.size > 0 ? Array.from(nrcSet).join(', ') : String(nrcCode);
        const vg = t.videogame;
        const grade = this.calculateAverageGrade(vg?.evaluations);
        let calificacionDocente: number | null = null;
        if (vg?.id) {
          const ev = await this.prisma.evaluation.findFirst({ where: { videogameId: vg.id, jurorId: professorId }, select: { totalScore: true } });
          calificacionDocente = ev?.totalScore ?? null;
        }
        teamRows.push({
          teamCode: t.id,
          nrc: nrcCodes,
          team: t.teamName ?? 'No team',
          subject: subjectName,
          integrantes: members.join(', '),
          videogame: vg?.name ?? 'No videogame',
          calificacionFeria: grade,
          calificacionDocente,
          videogameId: vg?.id ?? null,
        });
      }
    } else {
      // Fallback grouping by members (older behavior) but grouped by team
      const memberWhere: Prisma.MemberWhereInput = {
        nrcs: { some: { code: nrcCode, professorId } },
        ...(includeInactive ? {} : { isActive: true }),
      };

      const members = await this.prisma.member.findMany({
        where: memberWhere,
        select: {
          firstName: true,
          lastName: true,
          studentCode: true,
          team: { select: { id: true, teamName: true, videogame: { select: { id: true, name: true, evaluations: { select: { totalScore: true } } } } } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });

      const groups = new Map<string | number, { teamId: number | string; teamName: string; videogameName: string; videogameId: number | null; members: string[]; grade: number | null }>();
      for (const m of members) {
        const teamKey = m.team?.id ?? `no_team_${m.studentCode}`;
        const teamName = m.team?.teamName ?? 'No team';
        const vg = m.team?.videogame;
        const videogameName = vg?.name ?? 'No videogame';
        const grade = this.calculateAverageGrade(vg?.evaluations);
        if (!groups.has(teamKey as any)) {
          groups.set(teamKey as any, { teamId: m.team?.id ?? '', teamName, videogameName, videogameId: vg?.id ?? null, members: [], grade });
        }
        const g = groups.get(teamKey as any)!;
        g.members.push(`${m.firstName} ${m.lastName}`);
        if (g.grade === null && grade !== null) g.grade = grade;
      }

      for (const [, g] of groups) {
        let calificacionDocente: number | null = null;
        if (g.videogameId) {
          const ev = await this.prisma.evaluation.findFirst({ where: { videogameId: g.videogameId, jurorId: professorId }, select: { totalScore: true } });
          calificacionDocente = ev?.totalScore ?? null;
        }
        teamRows.push({
          teamCode: g.teamId ?? '',
          nrc: nrcCode,
          team: g.teamName,
          subject: subjectName,
          integrantes: g.members.join(', '),
          videogame: g.videogameName,
          calificacionFeria: g.grade,
          calificacionDocente,
          videogameId: g.videogameId ?? null,
        });
      }
      // pagination for fallback: slice according to page/limit
      const totalItems = teamRows.length;
      const paged = teamRows.slice(offset, offset + limit);
      const totalPages = Math.ceil(totalItems / limit);
      return {
        data: paged,
        metadata: { totalItems, itemsOnCurrentPage: paged.length, currentPage: page, itemsPerPage: limit, totalPages },
      };
    }

    // If we reached here, teamRows contains paginated rows (teams query case)
    const totalPages = Math.ceil(totalTeams / limit);
    return {
      data: teamRows,
      metadata: {
        totalItems: totalTeams,
        itemsOnCurrentPage: teamRows.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages,
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
    // Group teams and list all NRCs of the subject for each team
    const offset = (page - 1) * limit;
    const teamWhere: Prisma.TeamWhereInput = {
      members: {
        some: {
          nrcs: {
            some: {
              professorId: professorId,
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
            select: { firstName: true, lastName: true, nrcs: { where: { professorId: professorId, subject: { name: subjectName } }, select: { code: true } } },
          },
          videogame: { select: { id: true, name: true, evaluations: { select: { totalScore: true } } } },
        },
        orderBy: { teamName: 'asc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.team.count({ where: teamWhere }),
    ]);

    if (totalTeams === 0) {
      throw new NotFoundException(`No teams found for subject "${subjectName}" (Professor: ${professorId}).`);
    }

    const reportData = [] as any[];
    for (const t of teams) {
      const members = (t.members || []).map((m: any) => `${m.firstName} ${m.lastName}`);
      // Unir todos los NRCs de la materia para este equipo (de todos los miembros)
      const nrcSet = new Set<string>();
      for (const m of t.members) {
        for (const n of m.nrcs) nrcSet.add(String(n.code));
      }
      const nrcCodes = Array.from(nrcSet).join(', ');
      const vg = t.videogame;
      const grade = this.calculateAverageGrade(vg?.evaluations);
      let calificacionDocente: number | null = null;
      if (vg?.id) {
        const ev = await this.prisma.evaluation.findFirst({ where: { videogameId: vg.id, jurorId: professorId }, select: { totalScore: true } });
        calificacionDocente = ev?.totalScore ?? null;
      }
      reportData.push({
        teamCode: t.id,
        nrc: nrcCodes,
        team: t.teamName ?? 'No team',
        subject: subjectName,
        integrantes: members.join(', '),
        videogame: vg?.name ?? 'No videojuego',
        calificacionFeria: grade,
        calificacionDocente,
        videogameId: vg?.id ?? null,
      });
    }

    const totalPages = Math.ceil(totalTeams / limit);
    return {
      data: reportData,
      metadata: { totalItems: totalTeams, itemsOnCurrentPage: teams.length, currentPage: page, itemsPerPage: limit, totalPages },
    };
  }

  

  /**
   * Generate and send a single Excel workbook containing grading templates
   * for all subjects/NRCs associated with the given professor.
   * One worksheet is created per NRC. Worksheet names use a subject prefix
   * plus the NRC code and are trimmed/uniquified to satisfy Excel limits.
   *
   * When `final` is true the template includes both the computed
   * "Calificación Feria" column (read-only/style differentiated) and the
   * teacher's column "Calificación Docente" (prefilled if available).
   * When `final` is false the workbook is a blank template for the
   * professor to fill in.
   *
   * Streams the generated XLSX directly to the provided Express `res`.
   *
   * @param professorId - id of the professor
   * @param res - Express Response object to stream the file
   * @param final - include final feria columns when true
   */
  async downloadGradingTemplateAll(professorId: string, res: Response, final: boolean = false): Promise<void> {
    // High-level steps to generate the Excel file:
    // 1) Fetch subjects and NRCs for the professor
    // 2) For each NRC, build a worksheet name and create a worksheet
    // 3) Fetch members for the subject and group them by team
    // 4) Add headers and style them
    // 5) Fill rows from grouped data (only teams that have at least one member with the NRC)
    // 6) Auto-size columns and stream the workbook to the response

    // Step 1: fetch subjects with their NRCs
    const subjects = await this.findSubjects(professorId, true);

    if (!subjects || subjects.length === 0) {
      throw new NotFoundException('No se encontraron materias/NRCs para este profesor.');
    }

    const workbook = new ExcelJS.Workbook();
    const usedSheetNames = new Set<string>();

    for (const subj of subjects) {
      const subjectName: string = subj.name ?? 'SUBJECT';
      // Prefer explicit mapping from subject full name -> sigla when available.
      // This mapping covers known course codes like AYP1, AYP2, EDD1, EDD2, POO.
      // If no mapping exists, fall back to the heuristic (up to 3 initials +
      // optional digit).
      const normalize = (s: string) => {
        // lowercase, remove diacritics, keep letters/numbers/spaces
        let out = s
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        // convert trailing roman numerals to arabic (I, II, III, IV, V...)
        const romanMap: Record<string, string> = {
          i: '1',
          ii: '2',
          iii: '3',
          iv: '4',
          v: '5',
          vi: '6',
          vii: '7',
          viii: '8',
          ix: '9',
          x: '10',
        };
        const romMatch = out.match(/\b(i{1,3}|iv|v|vi|vii|viii|ix|x)\b$/i);
        if (romMatch) {
          const key = romMatch[0].toLowerCase();
          const digit = romanMap[key];
          if (digit) out = out.replace(new RegExp(key + '$', 'i'), digit);
        }
        return out;
      };

      const SUBJECT_SIGLAS_MAP: Record<string, string> = {
        // provide normalized keys (lowercase, no diacritics)
        'algoritmia y programacion 1': 'AYP1',
        'algoritmia y programacion 2': 'AYP2',
        'estructura de datos 1': 'EDD1',
        'estructura de datos 2': 'EDD2',
        'programacion orientada a objetos': 'POO',
        // add other explicit mappings here as needed
      };

      const normalizedName = normalize(subjectName);
      let prefix = SUBJECT_SIGLAS_MAP[normalizedName];
      if (!prefix) {
        // Build a subject code of up to 4 chars: up to 3 letters (initials) plus
        // an optional trailing digit if the subject includes one (e.g. 1 or 2).
        const words = (subjectName.match(/[A-Za-z0-9]+/g) || [subjectName]);
  const allInitials = words.map((w) => w[0]).join('').toUpperCase();
  // use normalizedName (which already converts roman numerals to digits)
  const digitMatch = (normalizedName.match(/(\d+)/g) || []).pop();
  const digit = digitMatch ? digitMatch.trim().charAt(0) : '';
        const letters = allInitials.substring(0, 3);
        prefix = (letters + (digit ? digit : '')).substring(0, 4) || subjectName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      }

      const nrcs = Array.isArray(subj.nrcs) && subj.nrcs.length > 0 ? subj.nrcs : [{ code: 'NO_NRC' }];

      for (const nrc of nrcs) {
        let baseSheetName = `${prefix}-${nrc.code}`;
        // Excel sheet name max length is 31
        if (baseSheetName.length > 31) baseSheetName = baseSheetName.substring(0, 31);

        let sheetName = baseSheetName;
        let counter = 1;
        while (usedSheetNames.has(sheetName)) {
          // make unique
          const suffix = `_${counter++}`;
          const trimmed = baseSheetName.substring(0, Math.max(0, 31 - suffix.length));
          sheetName = `${trimmed}${suffix}`;
        }
        usedSheetNames.add(sheetName);

        const worksheet = workbook.addWorksheet(sheetName);

        // (Removed title row - user requested no extra title line)

        // Prepare column keys and headers depending on whether this is the final export
        let columnKeys: string[];
        let headers: string[];
        if (final) {
          columnKeys = ['teamCode', 'subject', 'nrc', 'team', 'members', 'videogame', 'feriaScore', 'docenteScore'];
          headers = ['Código de Equipo', 'Materia', 'NRC', 'Equipo', 'Integrantes', 'Videojuego', 'Calificación Feria', 'Calificación Docente'];
        } else {
          columnKeys = ['teamCode', 'subject', 'nrc', 'team', 'members', 'videogame', 'score'];
          headers = ['Código de Equipo', 'Materia', 'NRC', 'Equipo', 'Integrantes', 'Videojuego', 'Calificación Docente'];
        }

        worksheet.columns = columnKeys.map((k) => ({ key: k }));

        // STEP A: fetch members for this subject and group them by team
        const members = await this.fetchMembersForExport(professorId, subjectName);
        const groups = this.groupMembersByTeam(members, String(nrc.code));

        // STEP B: add and style header row, get column sizing hints
        const { maxLens } = this.addAndStyleHeader(worksheet, headers, final);

        // STEP C: add data rows from groups (only teams that have at least one member with this NRC)
        await this.addGroupRows(worksheet, groups, subjectName, String(nrc.code), final, professorId, columnKeys, maxLens);

        // STEP D: finalize column sizing and alignment
        this.applyColumnSizing(worksheet, columnKeys, maxLens);
      }
    }

    // Step E: stream the workbook back to the client
    // Set correct headers for XLSX download and write the workbook to the response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=grading-template-all-${professorId}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  }

  /**
   * Fetch members for a given professor + subject used by the grading template.
   * Returns the same structure as the previous inline `memberSelectForExport`.
   */
  private async fetchMembersForExport(professorId: string, subjectName: string) {
    const videogameSelect = {
      name: true,
      evaluations: {
        select: {
          totalScore: true,
        },
      },
    };

    const teamSelect = {
      id: true,
      teamName: true,
      videogame: {
        select: videogameSelect,
      },
    };

    const memberSelectForExport = {
      firstName: true,
      lastName: true,
      studentCode: true,
      email: true,
      team: {
        select: teamSelect,
      },
      nrcs: {
        where: {
          professorId: professorId,
          subject: { name: subjectName },
        },
        select: { code: true },
      },
    };

    const memberWhereForExport: Prisma.MemberWhereInput = {
      nrcs: {
        some: {
          professorId: professorId,
          subject: { name: subjectName },
        },
      },
    };

    return await this.prisma.member.findMany({
      where: memberWhereForExport,
      select: memberSelectForExport,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /**
   * Group members by team and collect NRCs, member names and videogame info.
   * The returned Map uses teamIdKey as key and an object with shape matching
   * the original implementation so the table-writing code can remain similar.
   */
  private groupMembersByTeam(members: any[], currentNrcCode: string) {
    const groups = new Map<string | number, {
      teamId: number | string;
      teamName: string;
      videogameName: string;
      nrcCodes: Set<string>;
      members: string[];
      grade: number | null;
      hasNRC: boolean;
    }>();

    for (const member of members) {
      const teamIdKey = member.team?.id ?? `no_team_${member.studentCode}`;
      const teamName = member.team?.teamName ?? 'No team';
      const videogameObj = member.team?.videogame;
      const videogameName = videogameObj?.name ?? 'No videojuego';
      const grade = this.calculateAverageGrade(videogameObj?.evaluations);

      if (!groups.has(teamIdKey as any)) {
        groups.set(teamIdKey as any, {
          teamId: member.team?.id ?? '',
          teamName,
          videogameName,
          nrcCodes: new Set<string>(),
          members: [],
          grade,
          hasNRC: false,
        });
      }

      const g = groups.get(teamIdKey as any)!;
      for (const nrcObj of member.nrcs) {
        if (nrcObj.code) {
          g.nrcCodes.add(String(nrcObj.code));
          if (String(nrcObj.code) === String(currentNrcCode)) g.hasNRC = true;
        }
      }
      g.members.push(`${member.firstName} ${member.lastName}`);
      if (g.grade === null && grade !== null) g.grade = grade;
    }

    return groups;
  }

  /**
   * Add header row and apply styling. Returns the array of max lengths per column
   * used later for auto-sizing.
   */
  private addAndStyleHeader(worksheet: ExcelJS.Worksheet, headers: string[], final: boolean) {
    const headerTexts = headers;
    const maxLens = headerTexts.map((h) => h.length);

    const scoreHeaderIdx = headers.indexOf('Calificación Docente');
    const feriaHeaderIdx = headers.indexOf('Calificación Feria');
    const headerRow = worksheet.addRow(headerTexts);

    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true } as any;
      cell.alignment = { horizontal: 'center', vertical: 'middle' } as any;
      if (colNumber - 1 !== scoreHeaderIdx && colNumber - 1 !== feriaHeaderIdx) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' },
        } as any;
      }
      if (String(cell.value ?? '').length > maxLens[colNumber - 1]) {
        maxLens[colNumber - 1] = String(cell.value ?? '').length;
      }
    });

    if (scoreHeaderIdx >= 0) {
      const scoreHeaderCell = headerRow.getCell(scoreHeaderIdx + 1);
      scoreHeaderCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC6EFCE' },
      } as any;
    }
    if (final && feriaHeaderIdx >= 0) {
      const feriaHeaderCell = headerRow.getCell(feriaHeaderIdx + 1);
      feriaHeaderCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5D5FA' }, // morado claro
      } as any;
    }

    return { headerRow, maxLens };
  }

  /**
   * Given a team object (with teamId and videogameName), find the teacher's
   * evaluation for the current professor and return formatted score string.
   */
  private async getDocenteScoreForTeam(g: any, professorId: string): Promise<string> {
    let docenteScore = '';
    if (g.teamId && g.teamId !== '' && g.videogameName && g.videogameName !== 'No videojuego') {
      const vg = await this.prisma.videogame.findFirst({
        where: {
          teamId: typeof g.teamId === 'number' ? g.teamId : Number(g.teamId),
          name: g.videogameName,
        },
        select: { id: true },
      });
      if (vg && vg.id) {
        const ev = await this.prisma.evaluation.findFirst({ where: { videogameId: vg.id, jurorId: professorId }, select: { totalScore: true } });
        if (ev && ev.totalScore !== null && ev.totalScore !== undefined) {
          docenteScore = ev.totalScore.toFixed(1);
        }
      }
    }
    return docenteScore;
  }

  /**
   * Add rows to worksheet from grouped teams. Updates maxLens in place.
   */
  private async addGroupRows(
    worksheet: ExcelJS.Worksheet,
    groups: Map<string | number, any>,
    subjectName: string,
    nrcCode: string,
    final: boolean,
    professorId: string,
    columnKeys: string[],
    maxLens: number[],
  ) {
    let anyRow = false;
    for (const [, g] of groups) {
      if (!g.hasNRC) continue;
      const rowObj: Record<string, any> = {
        teamCode: g.teamId ?? '',
        subject: subjectName,
        nrc: Array.from(g.nrcCodes).join(', '),
        team: g.teamName,
        members: g.members.join(', '),
        videogame: g.videogameName,
      };

      if (final) {
        const docenteScore = await this.getDocenteScoreForTeam(g, professorId);
        rowObj.feriaScore = g.grade !== null ? g.grade.toFixed(1) : '';
        rowObj.docenteScore = docenteScore;
      } else {
        rowObj.score = g.grade !== null ? g.grade.toFixed(1) : '';
      }

      worksheet.addRow(rowObj);
      anyRow = true;

      // update column max lengths
      columnKeys.forEach((k, i) => {
        const v = String(rowObj[k] ?? '');
        if (v.length > maxLens[i]) maxLens[i] = v.length;
      });
    }

    if (!anyRow) {
      const emptyRow: Record<string, any> = {
        teamCode: '',
        subject: subjectName,
        nrc: nrcCode,
        team: 'No students',
        members: '',
        videogame: '',
      };
      if (final) {
        emptyRow.feriaScore = '';
        emptyRow.docenteScore = '';
      } else {
        emptyRow.score = '';
      }
      worksheet.addRow(emptyRow);
      columnKeys.forEach((k, i) => {
        const v = String(emptyRow[k] ?? '');
        if (v.length > maxLens[i]) maxLens[i] = v.length;
      });
    }
  }

  /**
   * Auto-size and align columns according to max lengths and column keys.
   */
  private applyColumnSizing(worksheet: ExcelJS.Worksheet, columnKeys: string[], maxLens: number[]) {
    worksheet.columns.forEach((col, idx) => {
      const calculated = Math.min(Math.max(maxLens[idx] + 2, 10), 50);
      col.width = calculated;
      if (columnKeys[idx] === 'members') {
        col.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' } as any;
      } else {
        col.alignment = { horizontal: 'center', vertical: 'middle' } as any;
      }
    });
  }

    

  /**
   * Process an uploaded Excel file containing senior juror grades.
   * The workbook is expected to include columns (case/spacing tolerant):
   * - Team Code (Código de Equipo)
   * - Subject (Materia)
   * - NRC/NRCS
   * - Team (Equipo)
   * - Members (Integrantes)
   * - Videogame (Videojuego)
   * - Teacher Grade (Calificación docente)
   *
   * For each row the function attempts to locate the videogame (by teamId
   * or by name) and then upserts an `Evaluation` with `isSenior = true`
   * and `totalScore` equal to the parsed grade value.
   *
   * @param file - uploaded file buffer (Multer file)
   * @param professorId - id of the professor performing the upload
   */
  async processSeniorGradesExcel(file: Express.Multer.File, professorId: string) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No se recibió archivo válido.');
    }

    const workbook = new ExcelJS.Workbook();
  // ExcelJS can accept the buffer; cast to any to avoid TS incompatibilities in this dev flow
  await (workbook.xlsx as any).load(file.buffer as any);

    // determine editionId (use latest or fallback to 1)
    const latestEdition = await this.prisma.edition.findFirst({ orderBy: { id: 'desc' } });
    const editionId = latestEdition?.id ?? 1;

    const results = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const sheet of workbook.worksheets) {
  // optional: validate sheet name structure here (initials of the subject - NRC)
      const headerRow = sheet.getRow(1);
      const headerMap: Record<string, number> = {};
      headerRow.eachCell((cell, colNumber) => {
        const raw = (cell.value ?? '').toString();
        const normalized = raw.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
        headerMap[normalized] = colNumber;
      });

      const normalizeKey = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

      for (let r = 2; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        // read by common header variants
        const teamCodeCell = row.getCell(headerMap['codigodeequipo'] ?? headerMap['codigo'] ?? 1).value;
        const subjectCell = row.getCell(headerMap['materia'] ?? headerMap['subject'] ?? 2).value;
        const nrcCell = row.getCell(headerMap['nrcnrsc'] ?? headerMap['nrc'] ?? 3).value;
        const teamNameCell = row.getCell(headerMap['equipo'] ?? 4).value;
        const videogameCell = row.getCell(headerMap['videojuego'] ?? headerMap['videogame'] ?? 6).value;
        const scoreCell = row.getCell(headerMap['calificaciondocente'] ?? headerMap['calificacion'] ?? headerMap['puntajedocente'] ?? 7).value;

        const teamCode = teamCodeCell ? teamCodeCell.toString().trim() : '';
        const videogameName = videogameCell ? videogameCell.toString().trim() : '';
        const scoreRaw = scoreCell ? scoreCell.toString().trim() : '';

        // skip empty rows
        if (!teamCode && !videogameName && !scoreRaw) continue;

        results.processed++;

        let videogame: any = null;
        try {
          if (teamCode && !isNaN(Number(teamCode))) {
            videogame = await this.prisma.videogame.findFirst({ where: { teamId: Number(teamCode) } });
          }
          if (!videogame && videogameName) {
            videogame = await this.prisma.videogame.findFirst({ where: { name: videogameName } });
          }

          if (!videogame) {
            results.errors.push(`Hoja "${sheet.name}" fila ${r}: No se encontró videojuego para teamCode='${teamCode}' name='${videogameName}'.`);
            continue;
          }

          const score = parseFloat(scoreRaw.replace(',', '.'));
          if (isNaN(score)) {
            results.errors.push(`Hoja "${sheet.name}" fila ${r}: Calificación inválida: '${scoreRaw}'.`);
            continue;
          }

          // Use Prisma upsert to combine update/create by the unique (jurorId, videogameId)
          // The schema defines the unique constraint with name `jurado_videojuego_unique`.
          const whereUnique = { jurado_videojuego_unique: { jurorId: professorId, videogameId: videogame.id } } as any;
          try {
            const exists = await this.prisma.evaluation.findUnique({ where: whereUnique });
            const upsertData = await this.prisma.evaluation.upsert({
              where: whereUnique,
              update: { totalScore: score, isSenior: true },
              create: { jurorId: professorId, videogameId: videogame.id, totalScore: score, isSenior: true, editionId },
            });
            if (exists) results.updated++;
            else results.created++;
          } catch (err) {
            throw err; // let outer catch handle and record
          }
        } catch (err) {
          const msg = (err as any)?.message ?? String(err);
          this.logger.error(`Error processing sheet ${sheet.name} row ${r}: ${msg}`);
          results.errors.push(`Hoja "${sheet.name}" fila ${r}: Error al procesar: ${msg}`);
        }
      }
    }

    return results;
  }

  /**
   * Update or create an Evaluation for a team (or videogame).
   * Uses an upsert based on the unique (jurorId, videogameId) composite key
   * to atomically create or update the evaluation record.
   *
   * Returns an object with `{ action: 'created'|'updated', evaluation }`.
   *
   * @param teamId - optional team id to locate the videogame
   * @param professorId - juror/professor id used as jurorId in evaluation
   * @param score - numeric score to store as totalScore
   * @param isSenior - boolean flag to mark the evaluation as senior
   * @param videogameId - optional explicit videogame id to use instead of teamId
   */
  async updateTeamEvaluation(
    videogameId: number,
    professorId: string,
    score: number,
    isSenior: boolean = true,
  ) {
    // videogameId is required by the controller/DTO
    if (videogameId == null || videogameId === 0) {
      throw new BadRequestException('videogameId is required');
    }

    // resolve videogame by id
    const videogame = await this.prisma.videogame.findUnique({ where: { id: videogameId } });
    if (!videogame) {
      throw new NotFoundException(`No videogame found for id ${videogameId}`);
    }

    // determine edition id (use latest or fallback)
    const latestEdition = await this.prisma.edition.findFirst({ orderBy: { id: 'desc' } });
    const editionId = latestEdition?.id ?? 1;

    try {
      // Prisma unique constraint is named `jurado_videojuego_unique` in schema.prisma
      const whereUnique = { jurado_videojuego_unique: { jurorId: professorId, videogameId: videogame.id } } as any;
      const exists = await this.prisma.evaluation.findUnique({ where: whereUnique });
      const evaluation = await this.prisma.evaluation.upsert({
        where: whereUnique,
        update: Object.assign({ totalScore: score }, typeof isSenior === 'boolean' ? { isSenior } : {}),
        create: Object.assign({ videogameId: videogame.id, jurorId: professorId, totalScore: score, editionId }, typeof isSenior === 'boolean' ? { isSenior } : {}),
      });
      return { action: exists ? 'updated' : 'created', evaluation };
    } catch (err) {
      this.logger.error(`Failed to update/create evaluation for videogameId ${videogameId}: ${(err as any)?.message}`);
      throw new InternalServerErrorException('Failed to save evaluation');
    }
  }

  // exportSignatureReportToExcel removed — route is unused by frontend


  private calculateAverageGrade(
    evaluations: { totalScore: number | null }[] | undefined | null,
  ): number | null {
    if (!evaluations || evaluations.length === 0) {
      return null;
    }
    let sum = 0;
    // TODO: If we need to count only non-null evaluations then use
    // this variable for calculating the average
    let validScoresCount = 0;
    for (const evaluation of evaluations) {
      if (evaluation.totalScore !== null) {
        sum += evaluation.totalScore;
        validScoresCount++;
      }
    }
    if (evaluations.length === 0) return null;
    return sum / evaluations.length;
  }
}
