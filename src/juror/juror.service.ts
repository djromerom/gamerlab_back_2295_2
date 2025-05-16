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
import { JurorListItem } from './types/juror-list-item.type';

@Injectable()
export class JurorService {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) { }

  private async getJurorRoleId(): Promise<number> {
    const jurorRole = await this.prisma.role.findUnique({
      where: { name: 'Jurado' },
    });

    if (!jurorRole) {
      throw new Error('Role "Jurado" not found');
    }

    return jurorRole.id;
  }

  async create(dto: CreateJurorDto): Promise<User & { _count: number }> {
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
          LastName: dto.lastname,
          email: dto.email,
          username: dto.name,
          roleId: jurorRoleId,
          isActive: true,
        },
      });

      const _count = await this.prisma.evaluation.count({
        where: { jurorId: juror.id },
      });

      return {
        ...juror,
        _count,
      };
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

  async findAll(
    includeInactive: boolean,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<JurorListItem>> {
    const offset = (page - 1) * limit;

    const jurorRoleId = await this.getJurorRoleId();

    const whereClause: Prisma.UserWhereInput = { roleId: jurorRoleId };

    
    whereClause.isActive = true;

    const [items, totalItems, allVideogames] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          LastName: true,
          email: true,
          confirmationStatusId: true,
          lastSignInAt: true,
          evaluationsSubmitted: {
            select: { videogame: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.user.count({
        where: whereClause,
      }),
      this.prisma.videogame.findMany({
        select: { id: true, name: true },
      }),
    ]);

    const result = items.map(juror => {
      const evaluatedGameNames = juror.evaluationsSubmitted.map(e => e.videogame.name);

      const evaluatedIds = new Set(juror.evaluationsSubmitted.map(e => e.videogame.id));

      const unevaluatedGameNames = allVideogames
        .filter(vg => !evaluatedIds.has(vg.id))
        .map(vg => vg.name);

      return {
        id: juror.id,
        name: juror.name ?? '',
        LastName: juror.LastName ?? '',
        email: juror.email,
        confirmationStatusId: juror.confirmationStatusId,
        lastSignInAt: juror.lastSignInAt,
        evaluatedCount: evaluatedGameNames.length,
        evaluatedGameNames,
        unevaluatedCount: unevaluatedGameNames.length,
        unevaluatedGameNames,
      };
    });

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: result,
      metadata: {
        totalItems: totalItems,
        itemsOnCurrentPage: result.length,
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

  async update(
    id: string,
    dto: UpdateJurorDto,
  ): Promise<User & { _count: number }> {
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

    const updatedUser = await this.prisma.user.update({
      where: { id: existingJuror.id },
      data: dto,
    });

    const _count = await this.prisma.evaluation.count({
      where: { jurorId: id },
    });

    return {
      ...updatedUser,
      _count,
    };
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
