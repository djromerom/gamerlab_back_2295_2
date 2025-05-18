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

@Injectable()
export class ProfessorsService {
  private readonly logger = new Logger(ProfessorsService.name);
  private professorRoleId: number;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {
    this.initializeProfessorRoleId();
  }

  private async initializeProfessorRoleId() {
    const PROFESSOR_ROLE_NAME = 'Profesor';
    try {
      const professorRole = await this.prisma.role.findUnique({
        where: { name: PROFESSOR_ROLE_NAME, isActive: true },
      });
      if (!professorRole) {
        this.logger.error(
          `CRITICAL: The role '${PROFESSOR_ROLE_NAME}' was not found or is inactive during service initialization.`,
        );
        throw new InternalServerErrorException(
          `Professor role configuration is missing.`,
        );
      }
      this.professorRoleId = professorRole.id;
      this.logger.log(
        `Professor Role ID initialized to: ${this.professorRoleId}`,
      );
    } catch (error) {
      let message = 'Failed to initialize Professor Role ID.';
      let stack: string | undefined;
      if (error instanceof Error) {
        message = `Failed to initialize Professor Role ID: ${error.message}`;
        stack = error.stack;
      }
      this.logger.error(message, stack);
      throw error; // Re-throw original error or a new wrapped error
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
        name: createProfessorDto.name,
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

      if (error instanceof Error) {
        errorMessage = error.message;
        errorStack = error.stack;

        this.logger.error(
          `Error during Supabase registration for ${createProfessorDto.email}: ${errorMessage}`,
          errorStack,
        );

        if (
          errorMessage.toLowerCase().includes('user already registered') ||
          errorMessage.toLowerCase().includes('email link sign-up not allowed')
        ) {
          throw new ConflictException(
            `The email ${createProfessorDto.email} is already registered with the authentication provider.`,
          );
        }
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
          name: createProfessorDto.name,
          email: createProfessorDto.email,
          username: createProfessorDto.name,
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
      select: { name: true, id: true },
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
        orderBy: { name: 'asc' },
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
}
