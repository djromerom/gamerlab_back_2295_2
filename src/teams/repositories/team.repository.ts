/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/teams/repositories/team.repository.ts
import { Injectable, Logger, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ITeamRepository } from '../interfaces/team-repository.interface';
import { CreateTeamDto } from '../dto/create-team.dto';
import { Team, Member, Videogame, User } from '@prisma/client';

@Injectable()
export class TeamRepository implements ITeamRepository {
  private readonly logger = new Logger(TeamRepository.name);

  constructor(private readonly prisma: PrismaService) { }

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

  async checkEmailsExist(emails: string[]): Promise<{ [email: string]: boolean }> {
    const result: { [email: string]: boolean } = {};

    // Initialize all emails as not existing
    emails.forEach(email => {
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
    [...existingUsers, ...existingMembers].forEach(user => {
      result[user.email] = true;
    });

    return result;
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

    return new Set(existingMembers.map(member => member.studentCode));
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

  async isRole(roleId: number | null | undefined, roleName: string): Promise<boolean> {
    if (roleId === null || roleId === undefined) {
      return false;
    }

    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        name: {
          equals: roleName,
          mode: 'insensitive',
        },
        isActive: true,
      },
      select: { id: true },
    });

    return !!role;
  }

  async createTeam(createTeamDto: CreateTeamDto, userId: string): Promise<{
    createdUser: User;
    team: Team;
    members: Member[];
    createdVideogame: Videogame;
  }> {
    const { teamName, videogame, members } = createTeamDto;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Verificar que el rol de Estudiante existe
        const studentRole = await tx.role.findUnique({
          where: { name: 'Estudiante' },
        });

        if (!studentRole) {
          throw new Error('Role "Estudiante" not found.');
        }

        const firstMember = members[0];

        // 2. Crear el usuario principal
        const createdUser = await tx.user.update({
          where: {id: userId },
          data: {
            firstName: firstMember.memberFirstName,
            lastName: firstMember.memberLastName,
            email: firstMember.memberEmail,
            roleId: studentRole.id,
          },
        });

        // 3. Crear el equipo
        const team = await tx.team.create({
          data: {
            teamName,
            userId: createdUser.id,
          },
        });

        // 4. Crear los miembros del equipo - verificando primero si los NRCs existen
        const createdMembers: Member[] = [];

        for (const member of members) {
          // Verificar que los NRCs existen antes de intentar conectarlos
          if (member.nrc && member.nrc.length > 0) {
            const nrcCodesFromDto = member.nrc.map(nrcCodeStr => parseInt(nrcCodeStr));

            const nrcsFoundInDb = await tx.nRC.findMany({
              where: {
                code: {
                  in: nrcCodesFromDto,
                },
                isActive: true
              },
              select: {
                id: true,
                code: true,
              },
            });

            const dbIdsOfValidNrcsToConnect = nrcsFoundInDb.map(nrc => nrc.id);
            const codesOfNrcsFoundInDb = nrcsFoundInDb.map(nrc => nrc.code);

            if (nrcsFoundInDb.length !== nrcCodesFromDto.length) {
              const missingNrcCodes = nrcCodesFromDto.filter(
                dtoCode => !codesOfNrcsFoundInDb.includes(dtoCode)
              );
              if (missingNrcCodes.length > 0) {
                this.logger.warn(`Some NRC codes provided for member ${member.memberEmail} were not found or are inactive: Missing ${missingNrcCodes.join(', ')}`);
              }
            }

            if (dbIdsOfValidNrcsToConnect.length > 0) {
              const createdMember = await tx.member.create({
                data: {
                  firstName: member.memberFirstName,
                  lastName: member.memberLastName,
                  email: member.memberEmail,
                  studentCode: member.studentCode,
                  teamId: team.id,
                  nrcs: {
                    connect: dbIdsOfValidNrcsToConnect.map(id => ({ id })),
                  },
                },
              });

              createdMembers.push(createdMember);
            } else {
              const createdMember = await tx.member.create({
                data: {
                  firstName: member.memberFirstName,
                  lastName: member.memberLastName,
                  email: member.memberEmail,
                  studentCode: member.studentCode,
                  teamId: team.id,
                },
              });

              createdMembers.push(createdMember);
            }
          } else {
            // Crear miembro sin NRCs
            const createdMember = await tx.member.create({
              data: {
                firstName: member.memberFirstName,
                lastName: member.memberLastName,
                email: member.memberEmail,
                studentCode: member.studentCode,
                teamId: team.id,
              },
            });

            createdMembers.push(createdMember);
          }
        }

        // 5. Crear el videojuego
        const createdVideogame = await tx.videogame.create({
          data: {
            name: videogame.vgName,
            description: videogame.description,
            logoUrl: videogame.logoURL,
            teamId: team.id,
            videogameStatusId: 1,
          },
        });

        return {
          createdUser,
          team,
          members: createdMembers,
          createdVideogame
        };
      });
    } catch (error) {
      this.logger.error('Transaction failed:', error);
      throw new InternalServerErrorException('Failed to create team.');
    }
  }

  async findAll(): Promise<Team[]> {
    return this.prisma.team.findMany();
  }

  async findOne(id: number): Promise<any> {
    return this.prisma.team.findUnique({
      where: { id },
    });
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
        githubUrl: true,
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

  async update(id: number, data: any): Promise<Team> {
    return this.prisma.team.update({
      where: { id },
      data,
    });
  }

  async updateTeamInfo(teamId: number, updateData: {
    teamName?: string;
    videogameName?: string;
    description?: string;
    videoUrl?: string | null;
    logoUrl?: string | null;
    githubUrl?: string | null;
  }): Promise<any> {
    const { teamName, videogameName, ...videogameData } = updateData;
    
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

      // Actualizar información del videojuego
      // Incluimos los campos incluso si son null para permitir eliminarlos
      const videogameUpdateData: any = {};
      if (videogameName !== undefined) {
        videogameUpdateData.name = videogameName;
      }
      if ('description' in videogameData) {
        videogameUpdateData.description = videogameData.description;
      }
      if ('videoUrl' in videogameData) {
        videogameUpdateData.videoUrl = videogameData.videoUrl === '' ? null : videogameData.videoUrl;
      }
      if ('logoUrl' in videogameData) {
        videogameUpdateData.logoUrl = videogameData.logoUrl === '' ? null : videogameData.logoUrl;
      }
      if ('githubUrl' in videogameData) {
        videogameUpdateData.githubUrl = videogameData.githubUrl === '' ? null : videogameData.githubUrl;
      }

      if (Object.keys(videogameUpdateData).length > 0) {
        await tx.videogame.update({
          where: { teamId },
          data: videogameUpdateData,
        });
      }
    });

    // Retornar los datos actualizados después de la transacción
    return this.findOneWithDetails(teamId);
  }

  async updateMemberEmail(memberId: number, newEmail: string, teamId: number): Promise<Member> {
    // Verificar que el miembro pertenece al equipo y no es el líder
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

  async getTeamsWithLessThanThreeJurors(): Promise<Array<{
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
  }>> {
    try {
      const confirmedStatus = await this.prisma.confirmationStatus.findUnique({
        where: { status: 'CONFIRMADO', isActive: true },
      });

      if (!confirmedStatus) {
        throw new InternalServerErrorException('Estado de confirmación no encontrado');
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
        .filter(team => team.assignedJurors.length < 3)
        .map(team => ({
          id: team.id,
          nombre: team.teamName,
          videojuego: team.videogame?.name || null,
          lider: {
            id: team.user.id,
            nombre: `${team.user.firstName} ${team.user.lastName}`,
            email: team.user.email,
          },
          juradosAsignados: team.assignedJurors.map(juror => ({
            id: juror.id,
            nombre: `${juror.firstName} ${juror.lastName}`,
            email: juror.email,
          })),
          cantidadJurados: team.assignedJurors.length,
        }));
    } catch (error) {
      this.logger.error('Error al obtener equipos con menos de 3 jurados:', error);
      throw new InternalServerErrorException('Error al obtener equipos con menos de 3 jurados');
    }
  }
}
