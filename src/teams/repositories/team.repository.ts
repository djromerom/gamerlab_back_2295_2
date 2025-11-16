// src/teams/repositories/team.repository.ts
import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ITeamRepository } from '../interfaces/team-repository.interface';
import { CreateTeamDto } from '../dto/create-team.dto';
import { Team, Member, Videogame, Prisma, User } from '@prisma/client';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateMemberDto } from 'src/members/dto/update-member.dto';
import { UpdateVideogameDto } from 'src/videogames/dto/update-videogame.dto';
import { MemberDto } from '../dto/member.dto';
import { VideogameDto } from '../dto/videogame.dto';
import { handlePrismaError } from 'src/prisma/prisma-exceptions.util';
import { getSubjectCode } from 'src/subjects/subjects-codes.util';

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

  async findExistingStudentCodes(studentCodes: string[]): Promise<Set<string>> {
    if (studentCodes.length === 0) {
      return new Set();
    }

    const existingMembers = await this.prisma.member.findMany({
      where: {
        studentCode: {
          in: studentCodes,
        },
      },
      select: {
        studentCode: true,
      },
    });

    return new Set(existingMembers.map((member) => member.studentCode));
  }

  async findMemberById(memberId: number): Promise<Member | null> {
    return this.prisma.member.findUnique({
      where: { id: memberId },
    });
  }

  async findUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  // Overloaded method to support both signatures
  async createTeam(createTeamDto: CreateTeamDto): Promise<{
    team: Team;
    members: Member[];
    videogame: Videogame;
  }>;
  async createTeam(
    createTeamDto: CreateTeamDto,
    userId: string,
  ): Promise<{
    createdUser: User;
    team: Team;
    members: Member[];
    createdVideogame: Videogame;
  }>;
  async createTeam(dto: CreateTeamDto, userId?: string): Promise<any> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        return this.createTeamInternal(dto, userId, tx);
      });
    } catch (error: any) {
      handlePrismaError(error);
    }
  }

  // Method to handle external transactions
  async createTeamWithTransaction(
    dto: CreateTeamDto,
    userId?: string,
    tx?: any
  ): Promise<any> {
    if (!tx) {
      // If no transaction provided, use the regular createTeam method
      if (userId) {
        return this.createTeam(dto, userId);
      } else {
        return this.createTeam(dto);
      }
    }

    // Use the provided transaction
    return this.createTeamInternal(dto, userId, tx);
  }

  // Private method with the actual team creation logic
  private async createTeamInternal(
    dto: CreateTeamDto, 
    userId?: string, 
    tx?: any
  ): Promise<any> {
    let finalUserId: string;
    let createdUser: User | undefined;

    if (userId) {
      // Dev branch approach - user is provided
      const { teamName, videogame, members } = dto;

      // 1. Verificar que el rol de Estudiante existe
      const studentRole = await tx.role.findUnique({
        where: { name: 'Estudiante' },
      });

      if (!studentRole) {
        throw new Error('Role "Estudiante" not found.');
      }

      const firstMember = members[0];

      // 2. Crear/actualizar el usuario principal
      createdUser = await tx.user.update({
        where: { id: userId },
        data: {
          firstName: firstMember.memberFirstName,
          lastName: firstMember.memberLastName,
          email: firstMember.memberEmail,
          roleId: studentRole.id,
        },
      });

      if (!createdUser) {
        throw new Error('Failed to update user.');
      }

      finalUserId = createdUser.id;

      // 3. Crear el equipo
      const team = await tx.team.create({
        data: {
          teamName,
          userId: finalUserId,
        },
      });

      // 4. Crear los miembros del equipo
      const createdMembers = await this.createMembersWithNrcs(tx, team.id, members);

      // 5. Crear el videojuego
      const createdVideogame = await tx.videogame.create({
        data: {
          name: videogame.vgName,
          description: videogame.description,
          logoUrl: videogame.logoUrl,
          videoUrl: videogame.videoUrl,
          repoUrl: videogame.repoUrl,
          additionalImages: videogame.additionalImages || [],
          teamId: team.id,
          videogameStatusId: 1,
        },
      });

      return {
        createdUser,
        team,
        members: createdMembers,
        createdVideogame,
      };
    } else {
      // HEAD branch approach - create/find user internally
      finalUserId = await this.handleUser(tx, dto.members[0]);
      const team = await this.createTeamRecord(tx, dto, finalUserId);
      const members = await this.createMembers(tx, team.id, dto.members);
      const videogame = await this.createVideogame(tx, team.id, dto.videogame);

      return {
        team,
        members,
        videogame,
      };
    }
  }

  // Helper method for creating members with NRCs (used by dev branch)
  private async createMembersWithNrcs(
    tx: Prisma.TransactionClient,
    teamId: number,
    members: MemberDto[]
  ): Promise<Member[]> {
    const createdMembers: Member[] = [];

    for (const member of members) {
      let memberData = {
        firstName: member.memberFirstName,
        lastName: member.memberLastName,
        email: member.memberEmail,
        studentCode: member.studentCode,
        teamId: teamId,
      };

      if (member.nrc && member.nrc.length > 0) {
        const nrcCodesFromDto = member.nrc.map((nrcCodeStr: string) =>
          parseInt(nrcCodeStr),
        );

        const nrcsFoundInDb = await tx.nRC.findMany({
          where: {
            code: { in: nrcCodesFromDto },
            isActive: true,
          },
          select: { id: true, code: true },
        });

        const dbIdsOfValidNrcsToConnect = nrcsFoundInDb.map((nrc: any) => nrc.id);

        if (dbIdsOfValidNrcsToConnect.length > 0) {
          const createdMember = await tx.member.create({
            data: {
              ...memberData,
              nrcs: {
                connect: dbIdsOfValidNrcsToConnect.map((id: any) => ({ id })),
              },
            },
          });
          createdMembers.push(createdMember);
        } else {
          const createdMember = await tx.member.create({ data: memberData });
          createdMembers.push(createdMember);
        }
      } else {
        const createdMember = await tx.member.create({ data: memberData });
        createdMembers.push(createdMember);
      }
    }

    return createdMembers;
  }

  async findAll(): Promise<Team[]> {
    return this.prisma.team.findMany({
      include: {
        videogame: true,
        members: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
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

  private readonly teamDetailsInclude = {
    user: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    },
    videogame: {
      select: {
        id: true,
        name: true,
        description: true,
        logoUrl: true,
        videoUrl: true,
        repoUrl: true,
      },
    },
    members: {
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        studentCode: true,
      },
    },
    assignedJurors: {
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
    edition: {
      select: {
        id: true,
        semester: true,
        title: true,
      },
    },
  };

  async findOneWithDetails(id: number): Promise<any> {
    return this.prisma.team.findUnique({
      where: { id },
      include: this.teamDetailsInclude,
    });
  }

  async findOneWithDetailsByLeaderId(leaderId: string): Promise<any> {
    return this.prisma.team.findFirst({
      where: { userId: leaderId },
      include: this.teamDetailsInclude,
    });
  }

  // Overloaded update methods to match interface
  async update(
    id: number,
    data: UpdateTeamDto,
  ): Promise<{
    updatedTeam: Team | null;
    updatedMembers: UpdateMemberDto[] | null;
    updatedVideogame: Videogame | null;
  }>;
  async update(id: number, data: any): Promise<Team>;
  async update(id: number, data: any): Promise<any> {
    if (
      data.teamName !== undefined ||
      data.isExternal !== undefined ||
      data.members ||
      data.videogame
    ) {
      // Complex update with members and videogame
      try {
        return await this.prisma.$transaction(async (tx) => {
          const teamData: UpdateTeamDto = {
            teamName: data.teamName,
            isExternal: data.isExternal,
          };
          const updatedTeam = teamData
            ? await this.updateTeam(tx, id, teamData)
            : null;

          const updatedMembers = data.members
            ? await this.updateMembers(tx, id, data.members)
            : null;

          const updatedVideogame = data.videogame
            ? await this.updateVideogame(tx, id, data.videogame)
            : null;
          return {
            updatedTeam,
            updatedMembers,
            updatedVideogame,
          };
        });
      } catch (err) {
        handlePrismaError(err);
      }
    } else {
      // Simple update
      return this.prisma.team.update({
        where: { id },
        data,
      });
    }
  }

  async updateTeamInfo(
    teamId: number,
    updateTeamDto: UpdateTeamDto,
  ): Promise<any> {
    const { teamName, videogame } = updateTeamDto;

    await this.prisma.$transaction(async (tx) => {
      // Actualizar nombre del equipo si se proporciona
      if (teamName !== undefined) {
        const existingTeam = await tx.team.findFirst({
          where: {
            teamName: {
              equals: teamName,
              mode: 'insensitive',
            },
            id: {
              not: teamId,
            },
          },
        });

        if (existingTeam) {
          throw new ConflictException('El nombre del equipo ya está en uso');
        }

        await tx.team.update({
          where: { id: teamId },
          data: { teamName },
        });
      }

      // Actualizar información del videojuego si se proporciona
      if (videogame) {
        const videogameUpdateData: any = {};
        
        if (videogame.vgName !== undefined) {
          videogameUpdateData.name = videogame.vgName;
        }
        if (videogame.description !== undefined) {
          videogameUpdateData.description = videogame.description;
        }
        if (videogame.videoUrl !== undefined) {
          videogameUpdateData.videoUrl =
            videogame.videoUrl === '' ? null : videogame.videoUrl;
        }
        if (videogame.logoUrl !== undefined) {
          videogameUpdateData.logoUrl =
            videogame.logoUrl === '' ? null : videogame.logoUrl;
        }
        if (videogame.repoUrl !== undefined) {
          videogameUpdateData.repoUrl =
            videogame.repoUrl === '' ? null : videogame.repoUrl;
        }
        if (videogame.additionalImages !== undefined) {
          videogameUpdateData.additionalImages =
            videogame.additionalImages || [];
        }
        if (videogame.videogameStatusId !== undefined) {
          videogameUpdateData.videogameStatusId = videogame.videogameStatusId;
        }

        if (Object.keys(videogameUpdateData).length > 0) {
          await tx.videogame.update({
            where: { teamId },
            data: videogameUpdateData,
          });
        }
      }
    });

    return this.findOneWithDetails(teamId);
  }

  async updateMemberEmail(
    memberId: number,
    newEmail: string,
    teamId: number,
  ): Promise<Member> {
    // Verificar que el miembro pertenece al equipo
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          where: { id: memberId },
        },
      },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    if (team.members.length === 0) {
      throw new Error('Member not found in team');
    }

    // Verificar que el email no esté en uso
    const existingEmail = await this.prisma.member.findFirst({
      where: {
        email: newEmail,
        id: { not: memberId },
      },
    });

    if (existingEmail) {
      throw new Error('Email already in use');
    }

    return this.prisma.member.update({
      where: { id: memberId },
      data: { email: newEmail },
    });
  }

  async remove(id: number): Promise<Team> {
    return this.prisma.team.delete({
      where: { id },
    });
  }

  async getTeamsWithLessThanThreeJurors(): Promise<
    Array<{
      id: number;
      nombre: string;
      videojuego: string | null;
      lider: {
        id: string;
        nombre: string;
        email: string;
      };
      juradosAsignados: Array<{
        id: string;
        nombre: string;
        email: string;
      }>;
      cantidadJurados: number;
    }>
  > {
    try {
      const confirmedStatus = await this.prisma.confirmationStatus.findUnique({
        where: { status: 'CONFIRMADO', isActive: true },
      });

      if (!confirmedStatus) {
        throw new InternalServerErrorException(
          'Estado de confirmación no encontrado',
        );
      }

      const teams = await this.prisma.team.findMany({
        where: {
          isActive: true,
          confirmId: confirmedStatus.id,
        },
        include: {
          assignedJurors: {
            where: {
              isActive: true,
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          videogame: {
            select: {
              id: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      return teams
        .filter((team) => team.assignedJurors.length < 3)
        .map((team) => ({
          id: team.id,
          nombre: team.teamName,
          videojuego: team.videogame?.name || null,
          lider: {
            id: team.user.id,
            nombre: `${team.user.firstName} ${team.user.lastName}`,
            email: team.user.email,
          },
          juradosAsignados: team.assignedJurors.map((juror) => ({
            id: juror.id,
            nombre: `${juror.firstName} ${juror.lastName}`,
            email: juror.email,
          })),
          cantidadJurados: team.assignedJurors.length,
        }));
    } catch (error) {
      this.logger.error(
        'Error al obtener equipos con menos de 3 jurados:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al obtener equipos con menos de 3 jurados',
      );
    }
  }

  // Private helper methods
  private async handleUser(
    tx: Prisma.TransactionClient,
    firstMember: MemberDto,
  ) {
    const studentRole = await tx.role.findUnique({
      where: { name: 'Estudiante' },
    });
    if (!studentRole) throw new Error('Role "Estudiante" not found');

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
    return userId;
  }

  private async createTeamRecord(
    tx: Prisma.TransactionClient,
    dto: CreateTeamDto,
    userId: string,
  ) {
    return await tx.team.create({
      data: {
        teamName: dto.teamName,
        isExternal: dto.isExternal,
        userId,
      },
    });
  }

  private async createMembers(
    tx: Prisma.TransactionClient,
    teamId: number,
    members: MemberDto[],
  ) {
    const createdMembers: Member[] = [];
    for (const member of members) {
      const checkIfExist = await tx.member.findUnique({
        where: { email: member.memberEmail },
      });
      if (checkIfExist)
        throw new ConflictException(
          `El correo ${member.memberEmail} ya está registrado en otro registro`,
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
          teamId,
          nrcs: {
            connect: nrcRecords.map((nrc) => ({ id: nrc.id })),
          },
        },
        include: { nrcs: true },
      });
      createdMembers.push(createdMember);
    }
    return createdMembers;
  }

  private async createVideogame(
    tx: Prisma.TransactionClient,
    teamId: number,
    videogame: VideogameDto,
  ) {
    return await tx.videogame.create({
      data: {
        name: videogame.vgName,
        teamId,
        description: videogame.description,
        repoUrl: videogame.repoUrl,
        videoUrl: videogame.videoUrl,
        logoUrl: videogame.logoUrl,
        additionalImages: videogame.additionalImages || [],
      },
    });
  }

  private async updateTeam(
    tx: Prisma.TransactionClient,
    id: number,
    data: UpdateTeamDto,
  ) {
    return await tx.team.update({
      where: { id: id },
      data: {
        teamName: data?.teamName,
        isExternal: data?.isExternal,
      },
    });
  }

  private async updateVideogame(
    tx: Prisma.TransactionClient,
    id: number,
    data: UpdateVideogameDto,
  ): Promise<Videogame> {
    return await tx.videogame.update({
      where: { teamId: id },
      data: {
        name: data.vgName,
        description: data.description,
        logoUrl: data.logoUrl,
        repoUrl: data.repoUrl,
        videoUrl: data.videoUrl,
        additionalImages: data.additionalImages || [],
        videogameStatusId: data.videogameStatusId,
      },
    });
  }

  private async updateMembers(
    tx: Prisma.TransactionClient,
    id: number,
    members: UpdateMemberDto[],
  ) {
    const updatedMembers: UpdateMemberDto[] = [];
    for (const member of members) {
      const dbMember = await tx.member.findUnique({
        where: { id: member.id },
      });

      if (!dbMember)
        throw new BadRequestException(
          `No se encontró a un usuario con id ${member.id}`,
        );

      const isLeader = await tx.user.findUnique({
        where: { email: dbMember?.email },
      });

      const existingEmail = member.memberEmail
        ? await tx.member.findUnique({
            where: { email: member.memberEmail },
          })
        : null;

      if (existingEmail)
        throw new ConflictException(
          `Ya existe un registro con el correo ${existingEmail.email}`,
        );

      const nrcRecords = await tx.nRC.findMany({
        where: {
          code: {
            in: (member.nrc ?? []).map(Number).filter((n) => !isNaN(n)),
          },
        },
        select: { id: true },
      });

      const updatedMember = await tx.member.update({
        where: { id: member.id, teamId: id },
        data: {
          email: isLeader ? isLeader.email : member.memberEmail,
          firstName: member.memberFirstName,
          lastName: member.memberLastName,
          studentCode: member.studentCode,
          nrcs: member.nrc
            ? {
                set: [],
                connect: nrcRecords.map((nrc) => ({ id: nrc.id })),
              }
            : undefined,
        },
      });
      updatedMembers.push(updatedMember);
    }
    return updatedMembers;
  }
}
