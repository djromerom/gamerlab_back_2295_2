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
import { Team, Member, Videogame, Prisma, User, EditionStatus } from '@prisma/client';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateMemberDto } from 'src/members/dto/update-member.dto';
import { UpdateVideogameDto } from 'src/videogames/dto/update-videogame.dto';
import { MemberDto } from '../dto/member.dto';
import { VideogameDto } from '../dto/videogame.dto';
import { handlePrismaError } from 'src/prisma/prisma-exceptions.util';
import { AuthService } from 'src/auth/auth.service';
import {
  generateUniqueVerificationCode,
  isCollegeTeamCode,
} from '../../team-verification/verification-code.util';

@Injectable()
export class TeamRepository implements ITeamRepository {
  private readonly logger = new Logger(TeamRepository.name);
  private readonly PENDING_REVIEW_STATUS_ID = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) { }

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
  }> {
    try {
      // verificationToken lives inside the tx — only sent after full commit
      let pendingVerificationToken: string | null = null;
      let pendingLeaderEmail: string | null = null;

      const result = await this.prisma.$transaction(async (tx) => {
        const { userId: finalUserId, verificationToken } = await this.handleUser(
          tx,
          createTeamDto.members[0],
        );

        // Capture token so we can send the email after the tx commits
        pendingVerificationToken = verificationToken;
        pendingLeaderEmail = createTeamDto.members[0].memberEmail;

        const team = await this.createTeamRecord(
          tx,
          createTeamDto,
          finalUserId,
        );
        const members = await this.createMembers(
          tx,
          team.id,
          createTeamDto.members,
        );
        const videogame = await this.createVideogame(
          tx,
          team.id,
          createTeamDto.videogame,
        );

        return { team, members, videogame };
      });

      // Transaction fully committed — safe to send the email now
      if (pendingVerificationToken && pendingLeaderEmail) {
        const token = pendingVerificationToken;
        const email = pendingLeaderEmail;
        setImmediate(() => {
          this.authService.sendVerificationEmail(email, token).catch((err) => {
            this.logger.error(
              `Failed to send verification email to ${email}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        });
      }

      return result;
    } catch (error: any) {
      handlePrismaError(error);
    }
  }

  async findAll(sortByLikes = false): Promise<Team[]> {
    const orderBy: Prisma.TeamOrderByWithRelationInput[] = [
      { videogame: { videogameStatusId: 'asc' } } // confirmed teams always first
    ];

    if (sortByLikes) {
      orderBy.push({ videogame: { likedBy: { _count: 'desc' } } });
      orderBy.push({ registrationDate: 'asc' });
    } else {
      orderBy.push({ id: 'asc' });
    }

    return this.prisma.team.findMany({
      orderBy: orderBy,
      include: {
        videogame: {
          include: {
            _count: {
              select: { likedBy: true }
            }
          }
        },
        members: {
          orderBy: { id: 'asc' },
        },
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

  async findPaged(page = 1, limit = 10, sortByLikes = false) {
    const currentPage = Math.max(page, 1);
    const itemsPerPage = Math.max(limit, 1);

    const orderBy: Prisma.TeamOrderByWithRelationInput[] = [
      { videogame: { videogameStatusId: 'asc' } } // confirmed teams always first
    ];

    if (sortByLikes) {
      orderBy.push({ videogame: { likedBy: { _count: 'desc' } } });
      orderBy.push({ registrationDate: 'asc' });
    } else {
      orderBy.push({ id: 'asc' });
    }
    const [teams, totalItems] = await this.prisma.$transaction([
      this.prisma.team.findMany({
        skip: (currentPage - 1) * itemsPerPage,
        take: itemsPerPage,
        orderBy: orderBy,
        include: {
          members: {
            include: {
              nrcs: {
                include: { subject: true },
              },
            },
            orderBy: { id: 'asc' },
          },
          videogame: {
            include: {
              _count: {
                select: { likedBy: true }
              }
            }
          },
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
        additionalImages: true,
        _count: {
          select: { likedBy: true },
        },
        videogameStatus: {
          select: {
            id: true,
            status: true,
          },
        },
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
    isAdmin: boolean,
  ): Promise<{
    updatedTeam: Team | null;
    updatedMembers: UpdateMemberDto[] | null;
    updatedVideogame: Videogame | null;
  }>;
  async update(id: number, data: any, isAdmin: boolean): Promise<Team>;
  async update(id: number, data: any, isAdmin: boolean): Promise<any> {
    if (
      data.teamName !== undefined ||
      data.isExternal !== undefined ||
      data.members ||
      data.videogame
    ) {
      // Complex update with members and videogame
      try {
        return await this.prisma.$transaction(async (tx) => {
          this.logger.log(`Updating team ID: ${id} with data: ${JSON.stringify(data)}`);
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
          if (!isAdmin) {
            await tx.videogame.update({
              where: { teamId: id },
              data: { videogameStatusId: this.PENDING_REVIEW_STATUS_ID },
            });
          }
          return {
            updatedTeam,
            updatedMembers,
            updatedVideogame,
          };
        });
      } catch (err) {
        this.logger.error('Error updating team:', err);
        handlePrismaError(err);
      }
    } else {
      // Simple update
      if (!isAdmin) {
        await this.prisma.videogame.update({
          where: { teamId: id },
          data: { videogameStatusId: this.PENDING_REVIEW_STATUS_ID },
        });
      }
      return this.prisma.team.update({
        where: { id },
        data,
      });
    }
  }

  async updateTeamInfo(
    teamId: number,
    updateTeamDto: UpdateTeamDto,
    isAdmin: boolean,
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
        if (videogame.gameFileUrl !== undefined) {
          videogameUpdateData.gameFileUrl = videogame.gameFileUrl;
        }
        if (videogame.entry !== undefined) {
          videogameUpdateData.entry = videogame.entry;
        }

        if (Object.keys(videogameUpdateData).length > 0) {
          await tx.videogame.update({
            where: { teamId },
            data: videogameUpdateData,
          });
        }

        if (!isAdmin) {
          await tx.videogame.update({
            where: { teamId: teamId },
            data: { videogameStatusId: this.PENDING_REVIEW_STATUS_ID },
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
    try {
      return await this.prisma.$transaction(async (tx) => {
        // First, get the team with user information
        const teamToDelete = await tx.team.findUnique({
          where: { id },
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });

        if (!teamToDelete) {
          throw new NotFoundException(`Team with id ${id} not found`);
        }

        if (!teamToDelete.user) {
          throw new NotFoundException(`User associated with team ${id} not found`);
        }

        // Delete the team (cascade delete videogames and members)
        const deletedTeam = await tx.team.delete({
          where: { id },
        });

        // Delete verification tokens for the user
        await tx.verificationToken.deleteMany({
          where: { email: teamToDelete.user.email },
        });

        // Delete the user
        await tx.user.delete({
          where: { id: teamToDelete.user.id },
        });

        return deletedTeam;
      });
    } catch (error: any) {
      handlePrismaError(error);
    }
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
      const confirmedStatus = await this.prisma.videogameStatus.findFirst({
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
          videogame: {
            videogameStatusId: confirmedStatus.id,
          },
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
              videogameStatus: {
                select: {
                  id: true,
                  status: true,
                },
              },
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

  async addMember(
    teamId: number,
    memberDto: MemberDto,
  ): Promise<Member | undefined> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const team = await tx.team.findUnique({ where: { id: teamId } });
        if (!team)
          throw new NotFoundException(`Equipo con ID ${teamId} no encontrado`);

        const members = await this.createMembers(tx, teamId, [memberDto]);

        return members[0];
      });
    } catch (err) {
      handlePrismaError(err);
    }
  }

  async deleteMember(
    teamId: number,
    memberId: number,
  ): Promise<{ message: string; member: Member | null } | undefined> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const team = await tx.team.findUnique({ where: { id: teamId } });
        if (!team)
          throw new NotFoundException(`Equipo con ID ${teamId} no encontrado`);

        const leader = await tx.user.findFirst({
          where: { id: team.userId },
        });

        const member = await tx.member.findUnique({ where: { id: memberId } });
        if (!member) {
          throw new NotFoundException(`Miembro con ID ${memberId} no encontrado`);
        }
        // BG-01: el miembro debe pertenecer al equipo indicado en la ruta; si no,
        // quien tenga permiso sobre SU equipo podría borrar miembros de otro.
        if (member.teamId !== teamId) {
          throw new NotFoundException(
            `Miembro con ID ${memberId} no encontrado en el equipo ${teamId}`,
          );
        }
        if (member?.email === leader?.email) {
          throw new BadRequestException(
            'No se puede eliminar al líder del equipo',
          );
        }

        await tx.member.delete({
          where: { id: memberId },
        });

        return { message: 'Miembro eliminado exitosamente', member };
      });
    } catch (err) {
      handlePrismaError(err);
    }
  }

  // Private helper methods
  private async handleUser(
    tx: Prisma.TransactionClient,
    firstMember: MemberDto,
  ): Promise<{ userId: string; verificationToken: string | null }> {
    const studentRole = await tx.role.findUnique({
      where: { name: 'Estudiante' },
    });
    if (!studentRole) throw new Error('Role "Estudiante" not found');

    // Case-insensitive: a user stored with capitals before emails were lowercased is the same user
    const existingUser = await tx.user.findFirst({
      where: {
        email: { equals: firstMember.memberEmail, mode: 'insensitive' },
      },
    });

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

      // Existing user re-registering: no new email needed
      return { userId: existingUser.id, verificationToken: null };
    }

    // New user — enlist creation inside the current tx so rollback is atomic.
    // If createTeamRecord / createMembers / createVideogame fail afterwards,
    // the User and VerificationToken are rolled back together with the rest.
    const { user: createdUser, verificationToken } =
      await this.authService.registerUserTransaction(
        { email: firstMember.memberEmail },
        tx,
      );

    // Fill in name and role (registerUserTransaction creates the user with empty fields)
    await tx.user.update({
      where: { id: createdUser.id },
      data: {
        firstName: firstMember.memberFirstName,
        lastName: firstMember.memberLastName,
        roleId: studentRole.id,
      },
    });

    return { userId: createdUser.id, verificationToken };
  }

  private async createTeamRecord(
    tx: Prisma.TransactionClient,
    dto: CreateTeamDto,
    userId: string,
  ) {
    if (dto.members.length === 0) {
      throw new BadRequestException('El equipo debe tener al menos un miembro');
    }

    if (dto.members[0].nrc.length === 0) {
      throw new BadRequestException(
        'El equipo debe tener al menos un NRC asociado',
      );
    }

    const activeEdition = await tx.edition.findFirst({
      where: {
        status: EditionStatus.ACTIVE,
      },
      orderBy: {
        id: 'desc',
      },
      select: {
        id: true,
      },
    });

    if (!activeEdition) {
      throw new BadRequestException('No hay una edición activa configurada');
    }

    const firstMemberNrcCode = Number(dto.members[0].nrc[0]);
    const teamCode = await this.generateTeamCode(firstMemberNrcCode);

    // HU-19: los equipos universitarios nacen con código de verificación; los de colegios (N0) no
    const verificationCode = isCollegeTeamCode(teamCode)
      ? null
      : await generateUniqueVerificationCode(tx, activeEdition.id);

    return await tx.team.create({
      data: {
        teamName: dto.teamName,
        isExternal: dto.isExternal,
        userId,
        teamCode,
        verificationCode,
        editionId: activeEdition.id,
      },
    });
  }

  private async generateTeamCode(nrcCode: number): Promise<string> {
    const subjectData = await this.getSubjectAbreviation(nrcCode);
    const abrev = subjectData.abrevName ?? this.genRandomAbrev();
    const teamSemester = subjectData.semester ?? 0;
    const teamNumber = await this.getTeamNumber(teamSemester);

    return `N${teamSemester}-${abrev}-${teamNumber}`;
  }

  private genRandomAbrev() {
    let res = '';
    for (let i = 0; i < 3; i++) {
      const char = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      res += char;
    }
    return res;
  }

  private async getSubjectAbreviation(nrcCode: number): Promise<{
    abrevName: string;
    semester: number;
  }> {
    const subject: { abrevName: string; semester: number } | null =
      await this.prisma.subject.findFirst({
        where: {
          nrcs: {
            some: { code: nrcCode },
          },
        },
        select: { abrevName: true, semester: true },
      });

    if (!subject) {
      throw new NotFoundException(
        `Materia asociada al nrc ${nrcCode} no encontrada.`,
      );
    }
    return { abrevName: subject.abrevName, semester: subject.semester };
  }

  private async getTeamNumber(semester: number): Promise<string> {
    const teams = await this.prisma.team.findMany({
      where: {
        teamCode: {
          startsWith: `N${semester}-`,
        },
      },
      select: {
        teamCode: true,
      },
    });

    const usedNumbers = teams
      .map((team) => team.teamCode.split('-').pop())
      .filter((num) => num !== undefined && num !== '')
      .map((num) => parseInt(num as string, 10))
      .filter((num) => !isNaN(num));

    // Find the smallest available team number in the semester's range
    const baseNumber = semester * 100 + 1;
    let teamNumber = baseNumber;
    while (usedNumbers.includes(teamNumber)) {
      teamNumber += 1;
    }

    return String(teamNumber).padStart(3, '0');
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
          `El correo ${member.memberEmail} ya está registrado en un equipo`,
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
    const { vgName, additionalImages, ...rest } = videogame;
    return await tx.videogame.create({
      data: {
        name: vgName,
        additionalImages: additionalImages || [],
        teamId,
        ...rest
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
    const { vgName, ...rest } = data
    return await tx.videogame.update({
      where: { teamId: id },
      data: {
        name: vgName,
        ...rest
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
          email: member.memberEmail,
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
      if (isLeader && member.memberEmail) {
        if (member.memberEmail !== dbMember.email) {
          const existingUser = await tx.user.findUnique({
            where: { email: member.memberEmail },
          });

          if (existingUser && existingUser.email !== dbMember.email) {
            throw new ConflictException(
              `El correo ${member.memberEmail} ya está en uso por otro usuario`,
            );
          }
        }

        await tx.user.update({
          where: { email: dbMember.email },
          data: {
            firstName: member.memberFirstName,
            lastName: member.memberLastName,
            email: member.memberEmail,
          },
        });
      }

      updatedMembers.push(updatedMember);
    }
    return updatedMembers;
  }
}
