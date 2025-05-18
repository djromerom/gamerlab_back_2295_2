import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  Inject,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { Prisma, User, Role } from '@prisma/client';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { JurorListItem } from './types/juror-list-item.type';

@Injectable()
export class JurorService {
  private readonly logger = new Logger(AuthService.name);
  private readonly JUROR_ROLE_NAME = "Jurado";
  private jurorRoleId: number;

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) { }

  async onModuleInit() {

    this.logger.log('Initializing Juror module: Fetching Juror role id');

    try {

      const jurorRole: Role | null = await this.prisma.role.findUnique({
        where: { name: this.JUROR_ROLE_NAME, isActive: true }
      });

      if (!jurorRole) {
        this.logger.error(
          `FATAL: Configuration Error during onModuleInit - Role '${this.JUROR_ROLE_NAME}' not found. Application might not function correctly.`,
        );
        throw new InternalServerErrorException(
          `Server configuration error: Missing required role '${this.JUROR_ROLE_NAME}'.`,
        );
      }

      this.jurorRoleId = jurorRole.id;
      this.logger.log(
        `Juror role ID initialized: Juror role ID=${this.jurorRoleId}`,
      );

    } catch (error) {
      if (error instanceof Error)
        this.logger.error(
          `Failed to initialize juror role id: ${error.message}`,
          error.stack,
        );
      throw error;
    }


  }

  async create(dto: CreateJurorDto): Promise<User & { _count: number }> {

    let user: SupabaseUser;
    try {
      user = await this.auth.registerUser({
        email: dto.email,
        name: dto.name,
      });

      if (!user || !user.id) {
        throw new InternalServerErrorException(
          `Supabase did not return a user ID for the email: ${dto.email}`,
        );
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `A juror with the email ${dto.email} already exists.`,
          );
        }
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `Error during registration in Supabase for ${dto.email}: ${error.message}`,
        );
      }

    }

    let juror: User;
    let _count: number = 0;
    try {
      juror = await this.prisma.user.create({
        data: {
          id: user!.id,
          name: dto.name,
          email: dto.email,
          username: dto.name,
          roleId: this.jurorRoleId,
          isActive: true,
        },
      });

      _count = await this.prisma.evaluation.count({
        where: { jurorId: juror.id },
      });

    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `A juror with the email ${dto.email} or ID ${user!.id} already exists.`,
          );
        }
      }

      if (error instanceof Error)
        throw new InternalServerErrorException(
          `Could not save the juror to the database for ${dto.email}: ${error.message}`,
        );
    }


    return {
      ...juror!,
      _count,
    };
  }

  async findAll(
    includeInactive: boolean,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<JurorListItem>> {
    const offset = (page - 1) * limit;


    const whereClause: Prisma.UserWhereInput = { roleId: this.jurorRoleId };

    // TODO: Implement support for 'includeInactive' query param
    whereClause.isActive = true;

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
          lastSignInAt: true,
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

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.roleId !== this.jurorRoleId) {
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

    if (!existingJuror || existingJuror.roleId !== this.jurorRoleId) {
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

    // Just in case, it's important to invalidate the cache of the current user
    this.auth.invalidateUserProfileCache(id);

    return {
      ...updatedUser,
      _count,
    };
  }

  async remove(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user || user.roleId !== this.jurorRoleId) {
      throw new NotFoundException(`Juror with ID ${id} not found.`);
    }

    const updatedUser = this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });


    // We invalidate the cache of the user being deleted
    this.auth.invalidateUserProfileCache(id);

    return updatedUser;

  }
}
