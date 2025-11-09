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
        isActive: true,
      },
    });

    if (!nrcInfo) {
      throw new NotFoundException(
        `NRC with code ${nrcCode} for the provided professor`,
      );
    }

    const subjectName = nrcInfo.subject.name;
    const actualNrcCode = nrcInfo.code;

    const videogameSelect = {
      id: true,
      name: true,
      evaluations: {
        select: {
          totalScore: true,
        },
      },
    };

    const teamSelect = {
      teamName: true,
      videogame: {
        select: videogameSelect,
      },
    };

    const memberSelect = {
      firstName: true,
      lastName: true,
      studentCode: true,
      email: true,
      team: {
        select: teamSelect,
      },
      isActive: true,
    };

    const memberWhere: Prisma.MemberWhereInput = {
      nrcs: {
        some: {
          code: nrcCode,
          professorId: professorId,
        },
      },
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where: memberWhere,
        select: memberSelect,
        skip: offset,
        take: limit,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.member.count({
        where: memberWhere,
      }),
    ]);

    if (totalItems === 0) {
      throw new NotFoundException(
        `No students found for NRC ${nrcCode} (Professor: ${professorId}) matching the criteria.`,
      );
    }

    const report = items.map((member) => {
      const selectedVideogame = member.team?.videogame;
      const grade = this.calculateAverageGrade(selectedVideogame?.evaluations);

      return {
        NRC: actualNrcCode,
        subject: subjectName,
        student: `${member.firstName} ${member.lastName}`,
        email: member.email,
        studentCode: member.studentCode,
        team: member.team?.teamName ?? 'No team',
        videogame: selectedVideogame?.name ?? 'No videogame',
        videogameId: selectedVideogame?.id ?? null,
        grade,
        // calificación docente: la nota que el profesor (jurado docente) haya puesto para este videojuego
        calificacionDocente: null as number | null,
      } as any;
    });

    // populate calificacionDocente for each report row by querying evaluation by this professor
    for (const row of report) {
      if (row.videogameId) {
        try {
          const evalByProf = await this.prisma.evaluation.findFirst({ where: { videogameId: row.videogameId, jurorId: professorId }, select: { totalScore: true } });
          row.calificacionDocente = evalByProf?.totalScore ?? null;
        } catch (err) {
          this.logger.warn(`Could not fetch teacher evaluation for videogameId ${row.videogameId}: ${(err as any)?.message}`);
        }
      }
    }

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: report,
      metadata: {
        totalItems: totalItems,
        itemsOnCurrentPage: items.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: totalPages,
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

    const videogameSelect = {
      id: true,
      name: true,
      evaluations: {
        select: {
          totalScore: true,
        },
      },
    };

    const teamSelect = {
      teamName: true,
      videogame: {
        select: videogameSelect,
      },
    };

    const memberSelect = {
      id: true,
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
          subject: {
            name: subjectName,
          },
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
      },
      isActive: true,
    };

    const memberWhere: Prisma.MemberWhereInput = {
      nrcs: {
        some: {
          professorId: professorId,
          subject: {
            name: subjectName,
          },
          ...(includeInactive ? {} : { isActive: true }),
        },
      },
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [paginatedMembers, totalUniqueMembers] =
      await this.prisma.$transaction([
        this.prisma.member.findMany({
          where: memberWhere,
          select: memberSelect,
          skip: offset,
          take: limit,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        }),
        this.prisma.member.count({
          where: memberWhere,
        }),
      ]);

    if (totalUniqueMembers === 0) {
      throw new NotFoundException(
        `No students found for subject "${subjectName}" (Professor: ${professorId}) matching activity criteria.`,
      );
    }

    const reportData = [];
    for (const member of paginatedMembers) {
      for (const nrc of member.nrcs) {
        const videogame = member.team?.videogame;
        const grade = this.calculateAverageGrade(videogame?.evaluations);

        reportData.push({
          NRC: nrc.code,
          subject: nrc.subject.name,
          student: `${member.firstName} ${member.lastName}`,
          email: member.email,
          studentCode: member.studentCode,
          team: member.team?.teamName ?? 'No team',
          videogame: videogame?.name ?? 'No videogame',
          videogameId: videogame?.id ?? null,
          grade,
          calificacionDocente: null as number | null,
        });
      }
    }

    // populate calificacionDocente per videogame for this professor
    for (const row of reportData) {
      if (row.videogameId) {
        try {
          const ev = await this.prisma.evaluation.findFirst({ where: { videogameId: row.videogameId, jurorId: professorId }, select: { totalScore: true } });
          row.calificacionDocente = ev?.totalScore ?? null;
        } catch (err) {
          this.logger.warn(`Could not fetch teacher evaluation for videogameId ${row.videogameId}: ${(err as any)?.message}`);
        }
      }
      // keep videogameId in the returned report data (was previously removed)
    }

    const totalPages = Math.ceil(totalUniqueMembers / limit);

    return {
      data: reportData,
      metadata: {
        totalItems: totalUniqueMembers,
        itemsOnCurrentPage: paginatedMembers.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: totalPages,
      },
    };
  }

  async exportNRCreportToExcel(
    nrcCode: number,
    professorId: string,
    res: Response,
  ): Promise<void> {
    const nrcSubjectSelect = {
      code: true,
      subject: {
        select: {
          name: true,
        },
      },
    };

    const videogameSelect = {
      id: true,
      name: true,
      evaluations: {
        select: {
          totalScore: true,
        },
      },
    };

    const teamSelect = {
      teamName: true,
      videogame: {
        select: videogameSelect,
      },
    };

    const memberSelect = {
      firstName: true,
      lastName: true,
      studentCode: true,
      email: true,
      nrcs: {
        where: { code: nrcCode, professorId: professorId },
        select: nrcSubjectSelect,
      },
      team: {
        select: teamSelect,
      },
    };

    const memberWhere: Prisma.MemberWhereInput = {
      nrcs: {
        some: {
          code: nrcCode,
          professorId: professorId,
        },
      },
    };

    const members = await this.prisma.member.findMany({
      where: memberWhere,
      select: memberSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const nrcDetails = await this.prisma.nRC.findFirst({
      where: { code: nrcCode, professorId: professorId },
      select: { subject: { select: { name: true } } },
    });

    if (members.length === 0) {
      throw new NotFoundException(`No data found for NRC ${nrcCode}`);
    }

    const flattenedData = members.flatMap((member) => {
      return member.nrcs.map(nrc => {
        const videogame = member.team?.videogame;
        const grade = this.calculateAverageGrade(videogame?.evaluations);

        return {
          NRC: nrc.code,
          subject: nrc.subject.name,
          student: `${member.firstName} ${member.lastName}`,
          email: member.email,
          studentCode: member.studentCode,
          team: member.team?.teamName ?? 'No team',
          videogame: videogame?.name ?? 'No videogame',
          videogameId: videogame?.id ?? null,
          calificacionDocente: '',
          grade: grade !== null ? grade.toFixed(2) : 'N/A',
        } as any;
      })
    });

    // populate calificacionDocente by querying evaluations by this professor
    for (const row of flattenedData) {
      if (row.videogameId) {
        try {
          const ev = await this.prisma.evaluation.findFirst({ where: { videogameId: row.videogameId, jurorId: professorId }, select: { totalScore: true } });
          row.calificacionDocente = ev?.totalScore != null ? String(ev.totalScore) : '';
        } catch (err) {
          this.logger.warn(`Could not fetch teacher evaluation for videogameId ${row.videogameId}: ${(err as any)?.message}`);
        }
      }
      (row as any).videogameId = undefined;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`NRC ${nrcCode} Report`);

    worksheet.addRow([`Report for NRC: ${nrcCode} (Professor ID: ${professorId})`]);

    worksheet.columns = [
      { header: 'NRC', key: 'NRC', width: 10 },
      { header: 'Subject', key: 'subject', width: 40 },
      { header: 'Student', key: 'student', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Student Code', key: 'studentCode', width: 20 },
      { header: 'Team', key: 'team', width: 20 },
      { header: 'Videogame', key: 'videogame', width: 20 },
      { header: 'Calificación docente', key: 'calificacionDocente', width: 18 },
      { header: 'Grade', key: 'grade', width: 10 },
    ];

    if (flattenedData.length > 0) {
      flattenedData.forEach((item) => worksheet.addRow(item));
    } else {
      worksheet.addRow({});
      worksheet.addRow({ NRC: "No student data found for this report." });
    }


    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=nrc-report-${nrcCode}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  /**
  * Genera y envía una plantilla Excel para que el profesor complete las
  * calificaciones de jurado senior para todas sus materias/NRCs.
  * Crea una hoja por cada NRC del profesor. El nombre de la hoja sigue el
  * formato: (iniciales de la materia) - NRC (ej: IA-1234, IAI-1234 según la materia).
   */
  async downloadGradingTemplateAll(professorId: string, res: Response): Promise<void> {
    // Obtener las materias con sus NRCs para el profesor (incluso si hay NRCs sin estudiantes)
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

        // define column keys and headers (we'll create the header row manually
        // to avoid duplicate headers and to be able to style it exactly)
        const columnKeys = ['teamCode', 'subject', 'nrc', 'team', 'members', 'videogame', 'score'];
        const headers = ['Código de Equipo', 'Materia', 'NRC', 'Equipo', 'Integrantes', 'Videojuego', 'Calificación docente'];

        worksheet.columns = columnKeys.map((k) => ({ key: k }));

        // prepare auto-sizing: start with header lengths
        const headerTexts = headers;
        const maxLens = headerTexts.map((h) => h.length);

        // add explicit header row so we can style it
        const scoreHeaderIdx = headers.indexOf('Calificación docente');
        const headerRow = worksheet.addRow(headerTexts);
        // style header: bold, centered, light gray background for all except score
        headerRow.eachCell((cell, colNumber) => {
          cell.font = { bold: true } as any;
          cell.alignment = { horizontal: 'center', vertical: 'middle' } as any;
          // light gray background for headers except the score column
          if (colNumber - 1 !== scoreHeaderIdx) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' },
            } as any;
          }
          // update maxLens with header lengths
          if (String(cell.value ?? '').length > maxLens[colNumber - 1]) {
            maxLens[colNumber - 1] = String(cell.value ?? '').length;
          }
        });
        // highlight only the 'Calificación docente' header with a light green
        if (scoreHeaderIdx >= 0) {
          const scoreHeaderCell = headerRow.getCell(scoreHeaderIdx + 1);
          scoreHeaderCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          } as any;
        }

        // Populate rows with actual students/teams for this NRC (similar to signature report)
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
              code: nrc.code,
              subject: {
                name: subjectName,
              },
            },
            select: {
              code: true,
              subject: {
                select: {
                  name: true,
                },
              },
            },
          },
        };

        const memberWhereForExport: Prisma.MemberWhereInput = {
          nrcs: {
            some: {
              professorId: professorId,
              code: nrc.code,
              subject: {
                name: subjectName,
              },
            },
          },
        };

        const members = await this.prisma.member.findMany({
          where: memberWhereForExport,
          select: memberSelectForExport,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });

          if (!members || members.length === 0) {
            // keep an empty row indicating no students
            const emptyRow = {
              teamCode: '',
              subject: subjectName,
              nrc: nrc.code,
              team: 'No students',
              members: '',
              videogame: '',
              score: '',
            } as Record<string, any>;
            worksheet.addRow(emptyRow);
            // update column max lengths
            columnKeys.forEach((k, i) => {
              const v = String(emptyRow[k] ?? '');
              if (v.length > maxLens[i]) maxLens[i] = v.length;
            });
          } else {
            // Group members by team id (members without team get their own row)
            const groups = new Map<string | number, {
              teamId: number | string;
              teamName: string;
              videogameName: string;
              members: string[];
              grade: number | null;
            }>();

            for (const member of members) {
              const teamIdKey = member.team?.id ?? `no_team_${member.studentCode}`;
              const teamName = member.team?.teamName ?? 'No team';
              const videogameObj = member.team?.videogame;
              const videogameName = videogameObj?.name ?? 'No videogame';
              const grade = this.calculateAverageGrade(videogameObj?.evaluations);

              if (!groups.has(teamIdKey as any)) {
                groups.set(teamIdKey as any, {
                  teamId: member.team?.id ?? '',
                  teamName,
                  videogameName,
                  members: [],
                  grade,
                });
              }
              const g = groups.get(teamIdKey as any)!;
              g.members.push(`${member.firstName} ${member.lastName}`);
              // if grade is null but another member in same group has a grade, prefer the non-null
              if (g.grade === null && grade !== null) g.grade = grade;
            }

            for (const [, g] of groups) {
              const rowObj = {
                teamCode: g.teamId ?? '',
                subject: subjectName,
                nrc: nrc.code,
                team: g.teamName,
                members: g.members.join(', '),
                videogame: g.videogameName,
                score: g.grade !== null ? g.grade.toFixed(2) : '',
              } as Record<string, any>;
              worksheet.addRow(rowObj);
              // update column max lengths
              columnKeys.forEach((k, i) => {
                const v = String(rowObj[k] ?? '');
                if (v.length > maxLens[i]) maxLens[i] = v.length;
              });
            }
          }
          // apply calculated widths (add small padding, cap at 50) and column alignments
          worksheet.columns.forEach((col, idx) => {
            const calculated = Math.min(Math.max(maxLens[idx] + 2, 10), 50);
            col.width = calculated;
            // center all editable fields except 'members'
            if (columnKeys[idx] === 'members') {
              col.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' } as any;
            } else {
              col.alignment = { horizontal: 'center', vertical: 'middle' } as any;
            }
          });
      }
    }

    // set response headers and stream the workbook
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=grading-template-all-${professorId}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }

  /**
   * Procesa un archivo Excel con calificaciones de jurado senior.
   * Se espera que el archivo contenga columnas (cualquier variante de casing/espacios):
   * - Código de Equipo
   * - Materia
   * - NRC/NRCS
   * - Equipo
   * - Integrantes
   * - Videojuego
   * - Calificación docente
   *
   * Para cada fila intenta localizar el videojuego (por teamId o por nombre) y crea/actualiza
   * una evaluación con `isSenior = true` y `totalScore` igual a la calificación indicada.
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

          // check existing evaluation
          const existing = await this.prisma.evaluation.findFirst({ where: { jurorId: professorId, videogameId: videogame.id } });
          if (existing) {
            const updateData: any = { totalScore: score, isSenior: true };
            await this.prisma.evaluation.update({ where: { id: existing.id }, data: updateData });
            results.updated++;
          } else {
            const createData: any = { jurorId: professorId, videogameId: videogame.id, totalScore: score, isSenior: true, editionId };
            await this.prisma.evaluation.create({ data: createData });
            results.created++;
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
   * Actualiza o crea una evaluación para un equipo mediante su teamId.
   * Retorna el objeto { action: 'created'|'updated', evaluation }
   */
  async updateTeamEvaluation(
    teamId: number | undefined,
    professorId: string,
    score: number,
    isSenior: boolean = true,
    videogameId?: number,
  ) {
    // require at least one identifier
    if ((teamId == null || teamId === 0) && (videogameId == null || videogameId === 0)) {
      throw new BadRequestException('Either teamId or videogameId is required');
    }

    // resolve videogame: prefer explicit videogameId (id field), else try by teamId
    let videogame: any = null;
    if (typeof videogameId === 'number' && !isNaN(videogameId)) {
      videogame = await this.prisma.videogame.findUnique({ where: { id: videogameId } });
    }
    if (!videogame && typeof teamId === 'number' && !isNaN(teamId)) {
      videogame = await this.prisma.videogame.findFirst({ where: { teamId } });
    }
    if (!videogame) {
      const identifier = videogameId ?? teamId;
      throw new NotFoundException(`No videogame found for identifier ${identifier}`);
    }

    // determine edition id (use latest or fallback)
    const latestEdition = await this.prisma.edition.findFirst({ orderBy: { id: 'desc' } });
    const editionId = latestEdition?.id ?? 1;

    try {
      const existing = await this.prisma.evaluation.findFirst({ where: { videogameId: videogame.id, jurorId: professorId } });
      if (existing) {
        const updateData: any = { totalScore: score };
        if (typeof isSenior === 'boolean') updateData.isSenior = isSenior;
        const updated = await this.prisma.evaluation.update({ where: { id: existing.id }, data: updateData as any });
        return { action: 'updated', evaluation: updated };
      } else {
        const createData: any = { videogameId: videogame.id, jurorId: professorId, totalScore: score, editionId };
        if (typeof isSenior === 'boolean') createData.isSenior = isSenior;
        const created = await this.prisma.evaluation.create({ data: createData as any });
        return { action: 'created', evaluation: created };
      }
    } catch (err) {
      this.logger.error(`Failed to update/create evaluation for teamId ${teamId}: ${(err as any)?.message}`);
      throw new InternalServerErrorException('Failed to save evaluation');
    }
  }

  async exportSignatureReportToExcel(
    subjectName: string,
    professorId: string,
    res: Response,
  ): Promise<void> {
    const videogameSelect = {
      id: true,
      name: true,
      evaluations: {
        select: {
          totalScore: true,
        },
      },
    };

    const teamSelect = {
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
          subject: {
            name: subjectName,
          },
        },
        select: {
          code: true,
          subject: {
            select: {
              name: true,
            },
          },
        },
      },
    };

    const memberWhereForExport: Prisma.MemberWhereInput = {
      nrcs: {
        some: {
          professorId: professorId,
          subject: {
            name: subjectName,
          },
        },
      },
    };

    const members = await this.prisma.member.findMany({
      where: memberWhereForExport,
      select: memberSelectForExport,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    if (members.length === 0) {
      throw new NotFoundException(`No data found for subject ${subjectName} (Professor: ${professorId}) to export.`);
    }

    const flattenedData = [];
    for (const member of members) {
      for (const nrc of member.nrcs) {
        const videogame = member.team?.videogame;
        const grade = this.calculateAverageGrade(videogame?.evaluations);

        flattenedData.push({
          NRC: nrc.code,
          subject: nrc.subject.name,
          student: `${member.firstName} ${member.lastName}`,
          email: member.email,
          studentCode: member.studentCode,
          team: member.team?.teamName ?? 'No team',
          videogame: videogame?.name ?? 'No videogame',
          videogameId: videogame?.id ?? null,
          calificacionDocente: '',
          grade: grade !== null ? grade.toFixed(2) : 'N/A',
        } as any);
      }
    }

    // Fill calificacionDocente by querying evaluations for this professor
    for (const row of flattenedData) {
      if (row.videogameId) {
        try {
          const ev = await this.prisma.evaluation.findFirst({ where: { videogameId: row.videogameId, jurorId: professorId }, select: { totalScore: true } });
          row.calificacionDocente = ev?.totalScore != null ? String(ev.totalScore) : '';
        } catch (err) {
          this.logger.warn(`Could not fetch teacher evaluation for videogameId ${row.videogameId}: ${(err as any)?.message}`);
        }
      }
      (row as any).videogameId = undefined;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Subject ${subjectName} Report`);

    worksheet.addRow([`Report for Subject: ${subjectName}`]);


    worksheet.columns = [
      { header: 'NRC', key: 'NRC', width: 10 },
      { header: 'Subject', key: 'subject', width: 40 },
      { header: 'Student', key: 'student', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Student Code', key: 'studentCode', width: 20 },
      { header: 'Team', key: 'team', width: 20 },
      { header: 'Videogame', key: 'videogame', width: 20 },
      { header: 'Calificación docente', key: 'calificacionDocente', width: 18 },
      { header: 'Grade', key: 'grade', width: 10 },
    ];

    if (flattenedData.length > 0) {
      flattenedData.forEach((item) => worksheet.addRow(item));
    } else {
      worksheet.addRow({});
      worksheet.addRow({ NRC: "No student data found for this report." });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=subject-report-${subjectName.replace(/\s+/g, '_')}-${professorId}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }


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
