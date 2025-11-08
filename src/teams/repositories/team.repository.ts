// src/teams/repositories/team.repository.ts
import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ITeamRepository } from '../interfaces/team-repository.interface';
import { CreateTeamDto } from '../dto/create-team.dto';
import { Team, Member, Videogame, Prisma } from '@prisma/client';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateMemberDto } from 'src/members/dto/update-member.dto';
import { UpdateVideogameDto } from 'src/videogames/dto/update-videogame.dto';
import { MemberDto } from '../dto/member.dto';
import { VideogameDto } from '../dto/videogame.dto';
import { handlePrismaError } from 'src/prisma/prisma-exceptions.util';

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

  async createTeam(dto: CreateTeamDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const userId = await this.handleUser(tx, dto.members[0]);
        const team = await this.createTeamRecord(tx, dto, userId);
        const members = await this.createMembers(tx, team.id, dto.members);
        const videogame = await this.createVideogame(
          tx,
          team.id,
          dto.videogame,
        );

        return {
          team,
          members,
          videogame,
        };
      });
    } catch (error: any) {
      handlePrismaError(error);
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

  async update(id: number, data: UpdateTeamDto) {
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
  }

  async remove(id: number): Promise<Team> {
    return this.prisma.team.delete({
      where: { id },
    });
  }

  // NOTA: Este usuario es el líder del equipo
  private async handleUser(
    tx: Prisma.TransactionClient,
    firstMember: MemberDto,
  ) {
    const studentRole = await tx.role.findUnique({
      where: { name: 'Estudiante' }, // ⚠️ Hardcodeado
    });
    if (!studentRole) throw new Error('Role "Estudiante" not found');

    // Verificar si el usuario ya existe
    // Si no existe se crea
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
      // Como los miembros se eliminan en cascada al eliminar el equipo
      // no es necesario hacer upsert por lo que si un miembro con el
      // mismo correo ya existe manda error directamente.
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
        uploads: data.uploads
          ? {
              deleteMany: {}, // Elimina todos los anteriores
              create: data.uploads.map((upload) => ({
                blobName: upload.blobName,
                filename: upload.filename,
                mimetype: upload.mimetype,
                size: upload.size,
              })),
            }
          : undefined,
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
      try {
        // Se verifica si el usuario a actualizar es el lider para posteriormente
        // bloquear si se intenta actualizar su correo
        // El lider es el único miembro que no puede actualizar su correo una vez registrado
        const dbMember = await tx.member.findUnique({
          where: { id: member.id },
        });

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
            // Solo se actualiza el email si NO es lider
            email: isLeader ? isLeader.email : member.memberEmail,
            firstName: member.memberFirstName,
            lastName: member.memberLastName,
            studentCode: member.studentCode,
            nrcs: member.nrc
              ? {
                  set: [], // Elimina los anteriores
                  connect: nrcRecords.map((nrc) => ({ id: nrc.id })),
                }
              : undefined,
          },
        });
        updatedMembers.push(updatedMember);
      } catch (error) {
        handlePrismaError(error);
      }
    }
    return updatedMembers;
  }

  private async createTeamCode(teamId: number) {
    // * El código dice qué nivel es el proyecto (si primer semestre o segundo)
    // * Luego dice la materia. En caso de los grupos donde sea, por ejemplo,
    // un proyecto para datos 1 y poo se coloca en el código cualquier materia -we don’t care-
    // * Por último, un número
    // Ex: N2-POO-09

    let teamSubjects;
    try {
      teamSubjects = await this.getTeamSubjects(teamId);
    } catch (err) {
      handlePrismaError(err);
    }
    const firstSubject = teamSubjects?.[0];
    const teamSemester = firstSubject?.semester ?? 0;
    const subjectCode =
      firstSubject?.code?.substring(0, 3).toUpperCase() ??
      this.genRandomChars();
    const number = teamId.toString().padStart(2, '0');

    return `N${teamSemester}-${subjectCode}-${number}`;
  }

  private async getTeamSubjects(teamId: number) {
    const teamInfo = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        members: {
          select: {
            nrcs: {
              select: {
                subject: true,
              },
            },
          },
        },
      },
    });

    const subjects = teamInfo?.members.flatMap((m) =>
      m.nrcs.map((nrc) => nrc.subject),
    );

    if (!subjects) return null;
    return subjects;
  }

  private genRandomChars() {
    let res = '';
    for (let i = 0; i < 3; i++) {
      const char = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      res += char;
    }
    return res;
  }
}
