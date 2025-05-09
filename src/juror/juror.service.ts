import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { Prisma, User, Role } from '@prisma/client';
import { PaginatedResult } from '../common/types/paginated-result.type';



@Injectable()
export class JurorService {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private async getJurorRoleId(): Promise<number> {
  const jurorRole = await this.prisma.role.findUnique({
    where: { name: 'Jurado' },
  });

  if (!jurorRole) {
    throw new Error('Role "Jurado" not found');
  }

  return jurorRole.id;
}


  async create(dto: CreateJurorDto): Promise<User> {

    const jurorRoleId = await this.getJurorRoleId();

    let user;
    try {
      const result = await this.auth.registerUser({
        email: dto.email,
        name: dto.name,
      });

      user = result.user as { id: string; email: string };

      if (!user || !user.id) {
        throw new InternalServerErrorException(
          `Supabase did not return a user ID for the email: ${dto.email}`,
        );
      }

    } catch (error) {
      if (error.message?.includes('User already registered')) {
        throw new ConflictException(
          `The email ${dto.email} is already registered.`,
        );
      }

      throw new InternalServerErrorException(
        `Error during registration in Supabase for ${dto.email}: ${error.message}`,
      );
    }

    try {
      const juror = await this.prisma.user.create({
        data: {
          id: user.id,
          name: dto.name,
          email: dto.email,
          username: dto.name,
          roleId: jurorRoleId,
          isActive: true,
        },
      });

      return juror;

    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `A juror with the email ${dto.email} or ID ${user.id} already exists.`,
          );
        }
      }

      throw new InternalServerErrorException(
        `Could not save the juror to the database for ${dto.email}: ${error.message}`,
      );
    }
  }


  async findAll(includeInactive: boolean, limit: number, page: number): Promise<PaginatedResult<JurorListItem>> {
    const offset = (page - 1) * limit;

    const jurorRoleId = await this.getJurorRoleId();

    const whereClause: Prisma.UserWhereInput = { roleId: jurorRoleId };

    if (!includeInactive) {
      whereClause.isActive = true;
    }

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          confirmationStatusId: true,
          updatedAt: true,
          _count: {
            select: {
              evaluationsSubmitted: true,
            },
          },
        },
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
    const user = await this.prisma.user.findUnique({ where: { id } });
    const jurorRoleId = await this.getJurorRoleId();

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.roleId !== jurorRoleId) {
      throw new NotFoundException('User is not a juror.');
    }

    if (!user.isActive) {
      throw new NotFoundException('User is not active.');
    }

    return user;
  }


  async update(id: string, dto: UpdateJurorDto): Promise<User> {
    const existingJuror = await this.findOne(id);
    const jurorRoleId = await this.getJurorRoleId();

    if (!existingJuror || existingJuror.roleId !== jurorRoleId) {
      throw new NotFoundException(`Juror with ID ${id} not found.`);
    }

    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email, isActive: true },
      });

      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictException('Email is already in use by another user.');
      }
    }

    return this.prisma.user.update({
      where: { id: existingJuror.id },
      data: dto,
    });
  }


  async remove(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    const jurorRoleId = await this.getJurorRoleId();

    if (!user || user.roleId !== jurorRoleId) {
      throw new NotFoundException(`Juror with ID ${id} not found.`);
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });
  }
}

  export type JurorListItem = {
    id: string;
    name: string | null;
    email: string;
    confirmationStatusId: number;
    updatedAt: Date;
    _count: {
      evaluationsSubmitted: number;
    };
  };