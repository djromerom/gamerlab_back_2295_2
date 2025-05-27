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
import { User as SupabaseUser } from '@supabase/supabase-js';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { SelectOption } from './types/select-option.type';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { PassThrough } from 'stream';
import { professorNrc } from './types/select-option.type';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

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

    let supabaseUser: SupabaseUser;
    try {
      supabaseUser = await this.authService.registerUser({
        email: createProfessorDto.email,
      });

      if (!supabaseUser || !supabaseUser.id) {
        this.logger.error(
          `Supabase user registration failed or did not return a user ID for email: ${createProfessorDto.email}`,
        );
        throw new InternalServerErrorException(
          'User registration failed at authentication provider.',
        );
      }
      this.logger.log(
        `Supabase user registered successfully: ${supabaseUser.id} for email ${createProfessorDto.email}`,
      );
    } catch (error) {
      let errorMessage = 'Unknown error during Supabase registration.';
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
          `Error during Supabase registration for ${createProfessorDto.email}: ${errorMessage}`,
          errorStack,
        );
      } else {
        this.logger.error(
          `Non-Error thrown during Supabase registration for ${createProfessorDto.email}: ${String(error)}`,
        );
      }
      // Fallback or re-throw specific error
      throw new InternalServerErrorException(
        `An error occurred with the authentication provider during registration: ${errorMessage}`,
      );
    }

    const existingLocalUserBySupabaseId = await this.prisma.user.findUnique({
      where: { id: supabaseUser.id },
    });

    if (existingLocalUserBySupabaseId) {
      this.logger.error(
        `Data inconsistency: Supabase user ID ${supabaseUser.id} (for new email: ${createProfessorDto.email}) already exists in local DB (associated with email: ${existingLocalUserBySupabaseId.email}).`,
      );
      throw new ConflictException(
        `A user profile for the generated authentication ID already exists locally. Please check data consistency.`,
      );
    }

    try {
      const newProfessor = await this.prisma.user.create({
        data: {
          id: supabaseUser.id,
          firstName: createProfessorDto.firstName,
          lastName: createProfessorDto.lastName,
          email: createProfessorDto.email,
          roleId: this.professorRoleId,
        },
      });
      this.logger.log(
        `Professor created successfully in local DB: ${newProfessor.id} (Supabase ID: ${supabaseUser.id})`,
      );
      return newProfessor;
    } catch (error) {
      let message = `Error creating professor profile in local DB for ${createProfessorDto.email} (Supabase ID: ${supabaseUser.id})`;
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
            `Failed to create professor due to a data conflict on: ${target?.join(', ')}. The Supabase user was created but local profile failed. Manual cleanup might be needed.`,
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
  ): Promise<Subject[]> {
    const subjectSelectOptions: Prisma.SubjectSelect = {
      id: true,
      name: true,
      code: true,
      semester: true,
      ...(includeNrcs && {
        where: {
          professorId: professorId,
        },
        select: {
          id: true,
          code: true,
        },
      }),
    };

    const subjects = await this.prisma.subject.findMany({
      where: {
        nrcs: {
          some: {
            professorId: professorId,
          },
        },
      },
      select: subjectSelectOptions,
    });

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
        `Attempting to update email for professor ${id}. This might require an update in Supabase as well.`,
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
        `Failed to deactivate professor ${id}.`, // Mensaje genérico aquí o el message específico
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

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where: memberWhere,
        select: memberSelect,
        skip: offset,
        take: limit,
      }),
      this.prisma.member.count({
        where: memberWhere,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    if (!items || items.length === 0) {
      throw new NotFoundException(
        `No students found for NRC with code ${nrcCode}`,
      );
    }

    const matchingNRC = items[0].nrcs.find((nrc) => nrc.code === nrcCode);

    if (!matchingNRC) {
      throw new NotFoundException(
        `No matching NRC ${nrcCode} found in the student data`,
      );
    }

    const subject = matchingNRC.subject.name;
    const NRC = matchingNRC.code;
    const report = items.map((i) => {
      const selectedVideogame = i.team?.videogame;
      const grade = selectedVideogame?.evaluations?.[0]?.totalScore ?? null;

      return {
        NRC,
        subject,
        student: `${i.firstName} ${i.lastName}`,
        email: i.email,
        studentCode: i.studentCode,
        team: i.team?.teamName ?? 'No team',
        videogame: selectedVideogame?.name ?? 'No videogame',
        grade,
      };
    });

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
    //professorId: string,
  ) {
    const offset = (page - 1) * limit;

    const evaluationSelect = {
      totalScore: true,
    };

    const videogameSelect = {
      name: true,
      evaluations: {
        select: evaluationSelect,
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
      team: {
        select: teamSelect,
      },
    };

    const nrcsSelect = {
      code: true,
      members: {
        select: memberSelect,
      },
    };

    const subjectSelect = {
      name: true,
      nrcs: {
        select: nrcsSelect,
      },
    };

    const subjectWhere: Prisma.SubjectWhereInput = {
      name: subjectName,
      /*nrcs: {
        some: {
          professorId: professorId,
        },
      },*/
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where: subjectWhere,
        select: subjectSelect,
      }),
      this.prisma.subject.count({
        where: subjectWhere,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    if (!items) {
      throw new NotFoundException(`Subject ${subjectName} does not exist`);
    }

    const reports = [];
    for (const subject of items) {
      for (const nrc of subject.nrcs) {
        for (const member of nrc.members) {
          const videogame = member.team?.videogame;
          const grade = videogame?.evaluations?.[0]?.totalScore ?? null;

          reports.push({
            NRC: nrc.code,
            subject: subject.name,
            student: `${member.firstName} ${member.lastName}`,
            studentCode: member.studentCode,
            team: member.team?.teamName ?? 'No team',
            videogame: videogame?.name ?? 'No videogame',
            grade,
          });
        }
      }
    }

    return {
      data: reports,
      metadata: {
        totalItems: totalItems,
        itemsOnCurrentPage: items.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: totalPages,
      },
    };
  }

  async exportNRCreportToExcel(nrcCode: number, res: Response): Promise<void> {
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
        select: nrcSubjectSelect,
      },
      team: {
        select: teamSelect,
      },
    };

    const memberWhere = {
      nrcs: {
        some: {
          code: nrcCode,
        },
      },
    };

    const data = await this.prisma.member.findMany({
      where: memberWhere,
      select: memberSelect,
    });

    const flattenedData = data.map((member) => {
      const nrc = member.nrcs.find((n) => n.code === nrcCode);

      return {
        NRC: nrc?.code ?? '',
        subject: nrc?.subject?.name ?? '',
        student: `${member.firstName} ${member.lastName}`,
        email: member.email,
        studentCode: member.studentCode,
        team: member.team?.teamName ?? '',
        videogame: member.team?.videogame?.name ?? '',
        grade: member.team?.videogame?.evaluations?.[0]?.totalScore ?? '',
      };
    });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('NRC Report');

    worksheet.columns = [
      { header: 'NRC', key: 'NRC', width: 10 },
      { header: 'Subject', key: 'subject', width: 40 },
      { header: 'Student', key: 'student', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Student Code', key: 'studentCode', width: 20 },
      { header: 'Team', key: 'team', width: 20 },
      { header: 'Videogame', key: 'videogame', width: 20 },
      { header: 'Score', key: 'grade', width: 10 },
    ];

    flattenedData.forEach((item) => worksheet.addRow(item));

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
    res: Response,
  ): Promise<void> {
    const evaluationSelect = {
      totalScore: true,
    };

    const videogameSelect = {
      name: true,
      evaluations: {
        select: evaluationSelect,
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
      team: {
        select: teamSelect,
      },
    };

    const nrcsSelect = {
      code: true,
      members: {
        select: memberSelect,
      },
    };

    const subjectSelect = {
      name: true,
      nrcs: {
        select: nrcsSelect,
      },
    };

    const subjectWhere = {
      name: subjectName,
    };

    const data = await this.prisma.subject.findMany({
      where: subjectWhere,
      select: subjectSelect,
    });

    const flattenedData = data.flatMap((subject) =>
      subject.nrcs.flatMap((nrc) =>
        nrc.members.map((member) => ({
          NRC: nrc.code,
          subject: subject.name,
          student: `${member.firstName} ${member.lastName}`,
          studentCode: member.studentCode,
          team: member.team?.teamName ?? '',
          videogame: member.team?.videogame?.name ?? '',
          grade: member.team?.videogame?.evaluations?.[0]?.totalScore ?? '',
        })),
      ),
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Subject Report');

    worksheet.columns = [
      { header: 'NRC', key: 'NRC', width: 10 },
      { header: 'Subject', key: 'subject', width: 40 },
      { header: 'Student', key: 'student', width: 30 },
      { header: 'Student Code', key: 'studentCode', width: 20 },
      { header: 'Team', key: 'team', width: 20 },
      { header: 'Videogame', key: 'videogame', width: 20 },
      { header: 'Score', key: 'grade', width: 10 },
    ];

    flattenedData.forEach((item) => worksheet.addRow(item));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=subject-report-${subjectName}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }
}
