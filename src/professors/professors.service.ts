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
import { PaginatedResult } from '../common/types/paginated-result.type';

@Injectable()
export class ProfessorsService {
  private readonly logger = new Logger(ProfessorsService.name);
  private readonly professorRoleId = 3;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) { }

  async create(createProfessorDto: CreateProfessorDto): Promise<User> {
    this.logger.log(
      `Attempting to create professor: ${createProfessorDto.email}`,
    );

    let supabaseUser;
    try {
      const result = await this.authService.registerUser({
        email: createProfessorDto.email,
        name: createProfessorDto.name,
      });
      supabaseUser = result.user as { id: string; email: string }; // Asegura el tipo mínimo

      if (!supabaseUser || !supabaseUser.id) {
        this.logger.error(
          `Supabase registration failed or did not return a user ID for email: ${createProfessorDto.email}`,
        );
        throw new InternalServerErrorException(
          'User registration failed at authentication provider.',
        );
      }
      this.logger.log(
        `Supabase user registered successfully: ${supabaseUser.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Error during Supabase registration for ${createProfessorDto.email}: ${error.message}`,
        error.stack,
      );

      if (error.message?.includes('User already registered')) {
        throw new ConflictException(
          `Email ${createProfessorDto.email} is already registered.`,
        );
      }
      throw error;
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
        `Professor created successfully in local DB: ${newProfessor.id}`,
      );
      return newProfessor;
    } catch (error) {
      this.logger.error(
        `Error creating professor in local DB for ${createProfessorDto.email} (Supabase ID: ${supabaseUser.id}): ${error.message}`,
        error.stack,
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Professor with email ${createProfessorDto.email} or ID ${supabaseUser.id} already exists locally.`,
          );
        }
      }

      throw new InternalServerErrorException(
        'Failed to save professor profile locally after registration.',
      );
    }
  }

  async findAll(includeInactive: boolean, limit: number, page: number): Promise<PaginatedResult<User>> {

    const offset = (page - 1) * limit;


    const professorRole: Role = await this.prisma.role.findUnique({ where: { name: "Profesor" } });

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
      this.logger.error(
        `Error updating professor ${id}: ${error.message}`,
        error.stack,
      );
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
      this.logger.error(
        `Error during soft delete for professor ${id}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to deactivate professor ${id}.`,
      );
    }
  }
}
