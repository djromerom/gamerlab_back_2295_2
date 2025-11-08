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
        grade,
      };
    });

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
          grade,
        });
      }
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
          grade: grade !== null ? grade.toFixed(2) : 'N/A',
        };
      })
    });

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

  async exportSignatureReportToExcel(
    subjectName: string,
    professorId: string,
    res: Response,
  ): Promise<void> {
    const videogameSelect = {
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
          grade: grade !== null ? grade.toFixed(2) : 'N/A',
        });
      }
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
