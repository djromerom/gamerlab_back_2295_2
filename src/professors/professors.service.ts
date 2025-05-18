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
import { Prisma, User, Role } from '@prisma/client';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { SelectOption } from './types/select-option.type';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { PassThrough } from 'stream';
import { professorNrc } from './types/select-option.type';


@Injectable()
export class ProfessorsService {
  private readonly logger = new Logger(ProfessorsService.name);
  private readonly professorRoleId = 3;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {

    // TODO: Fetch once the professorRole id. It's not ideal to do this on
    // each service function when it can be done here in the constructor!
  }

  async create(createProfessorDto: CreateProfessorDto): Promise<User> {
    this.logger.log(
      `Attempting to create professor: ${createProfessorDto.email}`,
    );

    let user: SupabaseUser;
    try {
      const user = await this.authService.registerUser({
        email: createProfessorDto.email,
        name: createProfessorDto.name,
      });

      if (!user || !user.id) {
        this.logger.error(
          `Supabase registration failed or did not return a user ID for email: ${createProfessorDto.email}`,
        );
        throw new InternalServerErrorException(
          'User registration failed at authentication provider.',
        );
      }
      this.logger.log(
        `Supabase user registered successfully: ${user.id}`,
      );
    } catch (error) {

      if (error instanceof Error) {
        this.logger.error(
          `Error during Supabase registration for ${createProfessorDto.email}: ${error.message}`,
          error.stack,
        );

        if (error.message?.includes('User already registered')) {
          throw new ConflictException(
            `Email ${createProfessorDto.email} is already registered.`,
          );
        }
      }
      throw error;
    }

    try {
      const newProfessor = await this.prisma.user.create({
        data: {
          id: user!.id,
          name: createProfessorDto.name,
          email: createProfessorDto.email,
          username: createProfessorDto.name,
          roleId: this.professorRoleId,
        },
      });
      this.logger.log(
        `Professor created successfully in local DB: ${newProfessor.id}`,
      );
      return newProfessor;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Error creating professor in local DB for ${createProfessorDto.email} (Supabase ID: ${user!.id}): ${error.message}`,
          error.stack,
        );
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Professor with email ${createProfessorDto.email} or ID ${user!.id} already exists locally.`,
          );
        }
      }

      throw new InternalServerErrorException(
        'Failed to save professor profile locally after registration.',
      );
    }
  }

  async findForSelect(): Promise<SelectOption[]> {

    const PROFESSOR_ROLE_NAME = 'Profesor';

    const professorRole: Role | null = await this.prisma.role.findUnique({
      where: { name: PROFESSOR_ROLE_NAME, isActive: true }
    })

    if (!professorRole)
      throw new InternalServerErrorException(`The role '${PROFESSOR_ROLE_NAME}' was not found in the database`);

    const professorRoleId = professorRole.id;

    const professors = await this.prisma.user.findMany({
      where: { roleId: professorRoleId, isActive: true },
      select: { name: true, id: true }
    });

    return professors;
  }

  async findAll(includeInactive: boolean, limit: number, page: number): Promise<PaginatedResult<User>> {

    const offset = (page - 1) * limit;

    const PROFESSOR_ROLE_NAME = 'Profesor';
    const professorRole: Role | null = await this.prisma.role.findUnique(
      { where: { name: PROFESSOR_ROLE_NAME, isActive: true } });

    if (!professorRole)
      throw new InternalServerErrorException(`The role '${PROFESSOR_ROLE_NAME}' was not found in the database`);

    const professorRoleId = professorRole.id

    const whereClause: Prisma.UserWhereInput = { roleId: professorRoleId }

    if (!includeInactive)
      whereClause.isActive = true;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' }
      }),
      this.prisma.user.count({
        where: whereClause
      })
    ]
    );

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: items,
      metadata: {
        totalItems: totalItems,
        itemsOnCurrentPage: items.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: totalPages,
      }
    }
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
      where: { id: id },
    });

    if (
      !existingProfessor ||
      existingProfessor.roleId !== this.professorRoleId
    ) {
      this.logger.warn(
        `Update failed: User ${id} not found or is not a professor.`,
      );
      throw new NotFoundException(`Professor with ID ${id} not found.`);
    }

    try {
      const updatedProfessor = await this.prisma.user.update({
        where: {
          id: id,
        },
        data: updateProfessorDto,
      });
      this.logger.log(`Professor ${id} updated successfully.`);
      return updatedProfessor;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Update failed due to unique constraint violation.`,
          );
        }
      }
      throw new InternalServerErrorException(
        `Failed to update professor ${id}.`,
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
      throw new NotFoundException(`Professor with ID ${id} not found.`);
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
      return deactivatedProfessor;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to deactivate professor ${id}.`,
      );
    }
  }


  async getNRCreport(nrcCode: number, includeInactive: boolean, limit: number, page: number) {
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

    const memberWhere = {
      nrcs: {
        some: {
          code: nrcCode,
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
      throw new NotFoundException(`No students found for NRC with code ${nrcCode}`);
    }

    const matchingNRC = items[0].nrcs.find((nrc) => nrc.code === nrcCode);

    if (!matchingNRC) {
      throw new NotFoundException(`No matching NRC ${nrcCode} found in the student data`);
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


  async GetSignatureReport(subjectName: string, includeInactive: boolean, limit: number, page: number) {
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
            subject: subject.name,
            student: `${member.firstName} ${member.lastName}`,
            studentCode: member.studentCode,
            team: member.team?.teamName ?? 'No team',
            videogame: videogame?.name ?? 'No videogame',
            grade
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
      const nrc = member.nrcs.find(n => n.code === nrcCode);

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

    flattenedData.forEach(item => worksheet.addRow(item));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=nrc-report-${nrcCode}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  }

  async exportSignatureReportToExcel(subjectName: string, res: Response): Promise<void> {
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

    const flattenedData = data.flatMap(subject =>
      subject.nrcs.flatMap(nrc =>
        nrc.members.map(member => ({
          NRC: nrc.code,
          subject: subject.name,
          student: `${member.firstName} ${member.lastName}`,
          studentCode: member.studentCode,
          team: member.team?.teamName ?? '',
          videogame: member.team?.videogame?.name ?? '',
          grade: member.team?.videogame?.evaluations?.[0]?.totalScore ?? '',
        }))
      )
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

    flattenedData.forEach(item => worksheet.addRow(item));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=subject-report-${subjectName}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  }

  async nrcProfessor(id: string): Promise<professorNrc[]> {
    const professor = await this.prisma.nRC.findMany({
      where: {
        professorId: id,
      },
      select: {
        code: true,
      },
    });
    return professor.map((professor) => ({
      nrcId: professor.code,
    }));
  }
}
