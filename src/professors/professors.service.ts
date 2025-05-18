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

@Injectable()
export class ProfessorsService {
  private readonly logger = new Logger(ProfessorsService.name);
  private readonly PROFESSOR_ROLE_NAME = "Profesor";
  private professorRoleId: number;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) { }

  async onModuleInit() {

    this.logger.log('Initializing Professor module: Fetching Professor role id');

    try {

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
      `Attempting to create professor: ${createProfessorDto.email}`,
    );

    let user: SupabaseUser;
    try {
      user = await this.authService.registerUser({
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

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Professor with email ${createProfessorDto.email} or ID ${user!.id} already exists locally.`,
          );
        }
      }

      if (error instanceof Error) {
        this.logger.error(
          `Error creating professor in local DB for ${createProfessorDto.email} (Supabase ID: ${user!.id}): ${error.message}`,
          error.stack,
        );
      }

      throw new InternalServerErrorException(
        'Failed to save professor profile locally after registration.',
      );
    }
  }

  async findForSelect(): Promise<SelectOption[]> {

    const professors = await this.prisma.user.findMany({
      where: { roleId: this.professorRoleId, isActive: true },
      select: { name: true, id: true }
    });

    return professors;
  }

  async findAll(includeInactive: boolean, limit: number, page: number): Promise<PaginatedResult<User>> {

    const offset = (page - 1) * limit;

    const whereClause: Prisma.UserWhereInput = { roleId: this.professorRoleId }

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


  async findNrcs(professorId: string, includeSubjects: boolean): Promise<NRC[]> {

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

  async findSubjects(professorId: string, includeNrcs: boolean): Promise<Subject[]> {

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
      })
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


      this.authService.invalidateUserProfileCache(id);

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

      this.authService.invalidateUserProfileCache(id);
      return deactivatedProfessor;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to deactivate professor ${id}.`,
      );
    }
  }
}
