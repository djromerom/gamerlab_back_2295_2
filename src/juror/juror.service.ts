import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { Prisma, User } from '@prisma/client';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { JurorListItem } from './types/juror-list-item.type';

@Injectable()
export class JurorService {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private async getJurorRoleId(): Promise<number> {
    const role = await this.prisma.role.findUnique({ where: { name: 'Jurado' } });
    if (!role) throw new Error('Role "Jurado" not found');
    return role.id;
  }

  private mapToJurorListItem(user: User, evaluatedNames: string[], unevaluatedNames: string[]): JurorListItem {
    return {
      id: user.id,
      firstName: user.firstName ?? '',
      LastName: user.LastName ?? '',
      email: user.email,
      confirmationStatusId: user.confirmationStatusId,
      lastSignInAt: user.lastSignInAt,
      evaluatedCount: evaluatedNames.length,
      evaluatedGameNames: evaluatedNames,
      unevaluatedCount: unevaluatedNames.length,
      unevaluatedGameNames: unevaluatedNames,
    };
  }

private async getEvaluationStats(jurorId: string): Promise<{ evaluated: string[]; unevaluated: string[] }> {
  const [evaluated, assignedTeams] = await this.prisma.$transaction([
    this.prisma.evaluation.findMany({
      where: { jurorId },
      select: { videogame: { select: { id: true, name: true } } },
    }),
    this.prisma.team.findMany({
      where: {
        assignedJurors: {
          some: { id: jurorId },}, videogame: { isNot: null,},},
      select: {
        videogame: {
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  const assignedGames = assignedTeams
    .filter(t => t.videogame !== null)
    .map(t => t.videogame!);

  const evaluatedIds = new Set(evaluated.map(e => e.videogame.id));
  const evaluatedNames = evaluated.map(e => e.videogame.name);

  const unevaluatedNames = assignedGames
    .filter(vg => !evaluatedIds.has(vg.id))
    .map(vg => vg.name);

  return {
    evaluated: evaluatedNames,
    unevaluated: unevaluatedNames,
  };
}


  async create(dto: CreateJurorDto): Promise<JurorListItem> {
    const roleId = await this.getJurorRoleId();

    let user: SupabaseUser;
    try {
      user = await this.auth.registerUser({
        email: dto.email,
        name: `${dto.firstName} ${dto.LastName}`.trim(),
      });

      if (!user?.id) {
        throw new InternalServerErrorException(`Supabase did not return a user ID for ${dto.email}`);
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Juror with email ${dto.email} already exists.`);
      }
      throw new InternalServerErrorException(`Error during registration in Supabase for ${dto.email}: ${error instanceof Error ? error.message : error}`);
    }

    try {
      const created = await this.prisma.user.create({
        data: {
          id: user.id,
          firstName: dto.firstName,
          LastName: dto.LastName,
          email: dto.email,
          username: dto.firstName,
          roleId,
          isActive: true,
        },
      });
      const stats = await this.getEvaluationStats(created.id);
      return this.mapToJurorListItem(created, stats.evaluated, stats.unevaluated);
    } catch (error) {
      throw new InternalServerErrorException(`Database error: ${error instanceof Error ? error.message : error}`);
    }
  }

  async findAll(includeInactive: boolean, limit: number, page: number): Promise<PaginatedResult<JurorListItem>> {
    const offset = (page - 1) * limit;
    const roleId = await this.getJurorRoleId();

    const where: Prisma.UserWhereInput = {
      roleId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [users, total, allGames] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { LastName: 'asc' },
        select: {
          id: true,
          name: true,
          username: true,
          firstName: true,
          LastName: true,
          email: true,
          confirmationStatusId: true,
          isActive: true,
          roleId: true,
          createdAt: true,
          updatedAt: true,
          lastSignInAt: true,
          evaluationsSubmitted: {
            select: { videogame: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.user.count({ where }),
            this.prisma.team.findMany({
        where: {
          assignedJurors: { some: { roleId } },
          videogame: { isNot: null },
        },
        select: {
          videogame: { select: { id: true, name: true } },
          assignedJurors: { select: { id: true } },
        },
      }),

    ]);

    const gameMap = new Map<string, string[]>(); 
    allGames.forEach(team => {
      team.assignedJurors.forEach(juror => {
        if (!gameMap.has(juror.id)) gameMap.set(juror.id, []);
        if (team.videogame) gameMap.get(juror.id)?.push(team.videogame.name);
      });
    });

    const data = users.map(user => {
      const evaluated = user.evaluationsSubmitted.map(e => e.videogame.name);
      const assigned = gameMap.get(user.id) || [];
      const unevaluated = assigned.filter(name => !evaluated.includes(name));
      return this.mapToJurorListItem(user, evaluated, unevaluated);
    });


    return {
      data,
      metadata: {
        totalItems: total,
        itemsOnCurrentPage: data.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    const roleId = await this.getJurorRoleId();

    if (!user || user.roleId !== roleId || !user.isActive) {
      throw new NotFoundException('Juror not found or inactive.');
    }

    return user;
  }

  async update(id: string, dto: UpdateJurorDto): Promise<JurorListItem> {
    const juror = await this.findOne(id);

    if (dto.email) {
      const emailOwner = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailOwner && emailOwner.id !== id) {
        throw new ConflictException('Email is already used by another user.');
      }
    }

    const updated = await this.prisma.user.update({ where: { id }, data: dto });
    const stats = await this.getEvaluationStats(id);
    return this.mapToJurorListItem(updated, stats.evaluated, stats.unevaluated);
  }

  async remove(id: string): Promise<User> {
    const user = await this.findOne(id);
    return this.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  }
}

