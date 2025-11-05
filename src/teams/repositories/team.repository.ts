// src/teams/repositories/team.repository.ts
import {
  Injectable,
  Logger,
  InternalServerErrorException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ITeamRepository } from '../interfaces/team-repository.interface';
import { CreateTeamDto } from '../dto/create-team.dto';
import { Team, Member, Videogame, Prisma } from '@prisma/client';
import { UpdateTeamDto } from '../dto/update-team.dto';

@Injectable()
export class TeamRepository implements ITeamRepository {
  private readonly logger = new Logger(TeamRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByTeamName(teamName: string): Promise<boolean> {
    const team = await this.prisma.team.findFirst({
      where: {
        teamName: {
          equals: teamName,
          mode: 'insensitive',
        },
      },
    });
    return !!team;
  }

  async findByVideogameName(videogameName: string): Promise<boolean> {
    const videogame = await this.prisma.videogame.findFirst({
      where: {
        name: {
          equals: videogameName,
          mode: 'insensitive',
        },
      },
    });
    return !!videogame;
  }

  async checkEmailsExist(
    emails: string[],
  ): Promise<{ [email: string]: boolean }> {
    const result: { [email: string]: boolean } = {};

    // Initialize all emails as not existing
    emails.forEach((email) => {
      result[email] = false;
    });

    // Find existing emails in the database
    const existingUsers = await this.prisma.user.findMany({
      where: {
        email: {
          in: emails,
        },
      },
      select: {
        email: true,
      },
    });

    // Find existing members that might not be users yet
    const existingMembers = await this.prisma.member.findMany({
      where: {
        email: {
          in: emails,
        },
      },
      select: {
        email: true,
      },
    });

    // Mark existing emails as true
    [...existingUsers, ...existingMembers].forEach((user) => {
      result[user.email] = true;
    });

    return result;
  }

  async getLeaderStatus(email: string) {
    return await this.prisma.user.findUnique({
      where: { email: email },
      select: {
        confirmationStatus: true,
      },
    });
  }

  async createTeam(createTeamDto: CreateTeamDto): Promise<{
    team: Team;
    members: Member[];
    createdVideogame: Videogame;
  }> {
    const { teamName, videogame, members, isExternal } = createTeamDto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const studentRole = await tx.role.findUnique({
          where: { name: 'Estudiante' },
        });
        if (!studentRole) throw new Error('Role "Estudiante" not found');
        const firstMember = members[0];

        // Verificar si el usuario ya existe
        // Si no existe se crea
        // Si ya existe y no tiene equipo se actualiza
        const existingUser = await tx.user.findUnique({
          where: { email: firstMember.memberEmail },
        });

        let userId;
        if (existingUser) {
          const hasTeam = await tx.team.findUnique({
            where: { userId: existingUser.id },
          });

          if (hasTeam)
            throw new ConflictException({
              statusCode: 409,
              message: `El usuario ${existingUser.email} ya pertenece a un equipo`,
              field: 'memberEmail',
            });

          userId = existingUser.id;
        } else {
          const createdUser = await tx.user.create({
            data: {
              email: firstMember.memberEmail,
              firstName: firstMember.memberFirstName,
              lastName: firstMember.memberLastName,
              roleId: studentRole.id,
            },
          });
          userId = createdUser.id;
        }

        const team = await tx.team.create({
          data: {
            teamName,
            isExternal,
            userId,
          },
        });

        const createdMembers: Member[] = [];
        for (const member of members.slice()) {
          // Como los miembros se eliminan en cascada al eliminar el equipo
          // no es necesario hacer upsert por lo que si un miembro con el
          // mismo correo ya existe manda error directamente.
          const checkIfExist = await tx.member.findUnique({
            where: { email: member.memberEmail },
          });
          if (checkIfExist)
            throw new ConflictException(
              `El miembro ${member.memberEmail} ya está registrado en otro equipo`,
            );

          const nrcRecords = await tx.nRC.findMany({
            where: {
              code: { in: member.nrc.map(Number) },
            },
            select: { id: true },
          });
          if (nrcRecords.length === 0) {
            throw new NotFoundException({
              statusCode: 400,
              message: `No se encontraron los NRCs con los códigos: ${member.nrc.join(`, `)}`,
              field: `nrc`,
            });
          }

          const createdMember = await tx.member.create({
            data: {
              email: member.memberEmail,
              firstName: member.memberFirstName,
              lastName: member.memberLastName,
              studentCode: member.studentCode,
              teamId: team.id,
              nrcs: {
                connect: nrcRecords.map((nrc) => ({ id: nrc.id })),
              },
            },
            include: { nrcs: true },
          });
          createdMembers.push(createdMember);
        }

        const createdVideogame = await tx.videogame.create({
          data: {
            name: videogame.vgName,
            teamId: team.id,
            description: videogame.description,
            repoUrl: videogame.repoUrl,
            videoUrl: videogame.videoUrl,
            logoUrl: videogame.logoUrl,
          },
        });

        return {
          team,
          members: createdMembers,
          createdVideogame,
        };
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
          case 'P2002': {
            const target = Array.isArray(error.meta?.target)
              ? error.meta.target.join(', ')
              : 'campo desconocido';

            throw new ConflictException(
              `El valor en el campo '${target}' está repetido o ya había sido registrado.`,
            );
          }

          case 'P2025':
            throw new BadRequestException('Registro no encontrado.');

          default:
            throw new InternalServerErrorException(
              `Error de base de datos: ${error.code}`,
            );
        }
      }

      throw new InternalServerErrorException(error.message);
    }
  }

  async findAll(): Promise<Team[]> {
    return this.prisma.team.findMany();
  }

  async findOne(id: number): Promise<Team | null> {
    return this.prisma.team.findUnique({
      where: { id },
    });
  }

  async findPaged(page = 1, limit = 10) {
    const currentPage = Math.max(page, 1);
    const itemsPerPage = Math.max(limit, 1);

    const [teams, totalItems] = await this.prisma.$transaction([
      this.prisma.team.findMany({
        skip: (currentPage - 1) * itemsPerPage,
        take: itemsPerPage,
        orderBy: { id: 'asc' },
        include: {
          members: {
            include: {
              nrcs: {
                include: { subject: true },
              },
            },
          },
          videogame: true,
        },
      }),
      this.prisma.team.count(),
    ]);

    const itemsOnCurrentPage = teams.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    return {
      data: teams,
      metaData: {
        totalItems,
        totalPages,
        itemsPerPage,
        currentPage,
        itemsOnCurrentPage,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
    };
  }

  async update(id: number, data: UpdateTeamDto): Promise<Team> {
    const nrcRecordsMap = new Map<string, number>();

    return await this.prisma.$transaction(async (tx) => {
      const updatedTeam = await tx.team.update({
        where: { id: id },
        data: {
          teamName: data?.teamName,
          isExternal: data?.isExternal,
        },
      });

      return updatedTeam;
    });
  }

  async remove(id: number): Promise<Team> {
    return this.prisma.team.delete({
      where: { id },
    });
  }
}
