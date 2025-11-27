// src/teams/services/teams.service.ts
import {
  Injectable,
  Logger,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateMemberEmailDto } from '../dto/update-member-email.dto';
import { RegisterUserDto } from '../dto/register-user.dto';
import { TeamRepository } from '../repositories/team.repository';
import { RecaptchaService } from './recaptcha.service';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { Member, Team, User } from '@prisma/client';
import { AppUser } from '../../auth/jwt.strategy';
import { MemberDto } from '../dto/member.dto';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly teamRepository: TeamRepository,
    private readonly recaptchaService: RecaptchaService,
    private readonly prisma: PrismaService,
  ) {}

  async findByTeamName(teamName: string): Promise<any> {
    return await this.teamRepository.findByTeamName(teamName);
  }

  async findByVideogameName(videogameName: string) {
    return await this.teamRepository.findByVideogameName(videogameName);
  }

  async validateEmails(validateEmailsDto: ValidateEmailsDto) {
    return await this.teamRepository.checkEmailsExist(validateEmailsDto.emails);
  }

  async create(createTeamDto: CreateTeamDto) {
    try {
      const isRecaptchaValid = await this.recaptchaService.verify(
        createTeamDto.recaptchaToken,
      );
      if (!isRecaptchaValid) {
        throw new UnauthorizedException('reCAPTCHA verification failed');
      }
    } catch (error) {
      this.logger.error(
        `reCAPTCHA verification error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Error en la verificación de reCAPTCHA');
    }

    const firstMember = createTeamDto.members[0];

    // Check if the email already exists
    const existingEmails = await this.teamRepository.checkEmailsExist([
      firstMember.memberEmail,
    ]);
    if (existingEmails[firstMember.memberEmail]) {
      throw new ConflictException(
        `The email ${firstMember.memberEmail} is already in use.`,
      );
    }

    // Check for duplicate student codes
    const studentCodeMap = new Map<string, boolean>();
    const studentCodes: string[] = [];

    for (const member of createTeamDto.members) {
      if (studentCodeMap.has(member.studentCode)) {
        throw new ConflictException(
          `Duplicate student code: ${member.studentCode} within request`,
        );
      }
      studentCodeMap.set(member.studentCode, true);

      studentCodes.push(member.studentCode);
    }

    const existingStudentCodes =
      await this.teamRepository.findExistingStudentCodes(studentCodes);
    for (const member of createTeamDto.members) {
      if (existingStudentCodes.has(member.studentCode)) {
        throw new ConflictException(
          `Student code ${member.studentCode} is already in use.`,
        );
      }
    }

    try {
      const result = await this.teamRepository.createTeam(createTeamDto);

      this.logger.log(
        `Team created successfully for user: ${firstMember.memberEmail}`,
      );
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.logger.error(
        `Transaction failed for team creation: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Handle specific error types
      if (errorMessage.toLowerCase().includes('user already registered')) {
        throw new ConflictException(
          `Email ${firstMember.memberEmail} is already registered.`,
        );
      }

      if (errorMessage.toLowerCase().includes('team already exists')) {
        throw new ConflictException(
          'A team with this information already exists.',
        );
      }

      throw new InternalServerErrorException(
        `Failed to create team: ${errorMessage}`,
      );
    }
  }

  async createAsAdmin(createTeamDto: CreateTeamDto, user?: AppUser) {
    const isAdmin = user?.roleId === 1;
    if (!isAdmin)
      throw new ForbiddenException(
        'You do not have permission to access this resource.',
      );
    return await this.teamRepository.createTeam(createTeamDto);
  }

  async registerUser(registerDto: RegisterUserDto) {
    const authRegisterPayload = {
      email: registerDto.email,
      name: registerDto.name,
    };

    return await this.authService.registerUser(authRegisterPayload);
  }

  async findAll(sortByLikes: boolean) {
    return this.teamRepository.findAll(sortByLikes);
  }

  async findOne(id: number): Promise<unknown> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid team id');
    }
    return await this.teamRepository.findOne(id);
  }

  async findOneWithDetails(identifier: string): Promise<unknown> {
    let team =
      await this.teamRepository.findOneWithDetailsByLeaderId(identifier);

    if (!team && /^\d+$/.test(identifier)) {
      const numericId = Number(identifier);
      team = await this.teamRepository.findOneWithDetails(numericId);
    }

    if (!team) {
      throw new NotFoundException(
        `Equipo con líder o ID ${identifier} no encontrado`,
      );
    }

    return team;
  }

  async update(id: number, updateTeamDto: UpdateTeamDto, currentUser: AppUser) {
    const team = await this.teamRepository.findOne(id);
    if (!team) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }

    const isLeader = team.userId === currentUser.id;
    const isAdmin = currentUser.roleId === 1;
    if (!isLeader && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to access this resource.',
      );
    }
    return this.teamRepository.update(id, updateTeamDto, isAdmin);
  }

  async updateTeamInfo(
    id: number,
    updateTeamDto: UpdateTeamDto,
    currentUser: AppUser,
  ) {
    // Verificar que el equipo existe y que el usuario es el líder
    const team = await this.teamRepository.findOne(id);
    if (!team) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }

    const isLeader = team.userId === currentUser.id;
    const isAdmin = currentUser.roleId === 1;
    if (!isLeader && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to access this resource.',
      );
    }

    return this.teamRepository.updateTeamInfo(id, updateTeamDto, isAdmin);
  }

  async updateMemberEmail(
    teamId: number,
    memberId: number,
    updateMemberEmailDto: UpdateMemberEmailDto,
    userId: string,
  ) {
    // Verificar que el equipo existe y que el usuario es el líder
    const team = await this.teamRepository.findOne(teamId);
    if (!team) {
      throw new NotFoundException(`Equipo con ID ${teamId} no encontrado`);
    }

    if (team.userId !== userId) {
      throw new UnauthorizedException(
        'Solo el líder del equipo puede actualizar los emails de los integrantes',
      );
    }

    // Verificar que el miembro existe y pertenece al equipo
    const member = await this.teamRepository.findMemberById(memberId);

    if (!member) {
      throw new NotFoundException(
        `Integrante con ID ${memberId} no encontrado`,
      );
    }

    if (!member.isActive) {
      throw new BadRequestException('El integrante está inactivo');
    }

    if (member.teamId !== teamId) {
      throw new BadRequestException('El integrante no pertenece a este equipo');
    }

    // Verificar que el email del líder no se está cambiando
    const leaderUser = await this.teamRepository.findUserById(team.userId);

    // Verificar que el miembro no es el líder (comparando emails)
    if (leaderUser && member.email === leaderUser.email) {
      throw new BadRequestException(
        'No se puede cambiar el email del líder usando este endpoint',
      );
    }

    if (leaderUser && leaderUser.email === updateMemberEmailDto.email) {
      throw new BadRequestException(
        'No se puede usar el email del líder para un integrante',
      );
    }

    try {
      return await this.teamRepository.updateMemberEmail(
        memberId,
        updateMemberEmailDto.email,
        teamId,
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Email already in use') {
          throw new ConflictException('El email ya está en uso');
        }
        if (
          error.message === 'Team not found' ||
          error.message === 'Member not found in team'
        ) {
          throw new NotFoundException(error.message);
        }
      }
      throw new InternalServerErrorException(
        'Error al actualizar el email del integrante',
      );
    }
  }

  async getTeamsWithLessThanThreeJurors(): Promise<any[]> {
    return this.teamRepository.getTeamsWithLessThanThreeJurors();
  }

  async getFinalScoreByVideogame(videogameId: number): Promise<any[] | null> {
    if (!Number.isInteger(videogameId) || videogameId <= 0) {
      throw new BadRequestException('Invalid videogame id');
    }
    const client: any = (this.prisma as any).teamFinalScore;
    return client.findMany({ where: { videogameId } });
  }

  async getFinalScoreByTeam(teamId: number): Promise<any[] | null> {
    if (!Number.isInteger(teamId) || teamId <= 0) {
      throw new BadRequestException('Invalid team id');
    }
    const client: any = (this.prisma as any).teamFinalScore;
    return client.findMany({ where: { teamId } });
  }

  async findPaged(page: number, limit: number, sortByLikes: boolean) {
    return await this.teamRepository.findPaged(page, limit, sortByLikes);
  }

  async getLeaderStatus(email: string) {
    return await this.teamRepository.getLeaderStatus(email);
  }

  async remove(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid team id');
    }

    const team: Team | null = await this.teamRepository.findOne(id);
    if (!team) {
      this.logger.warn(`Delete failed: Team ${id} not found.`);
      throw new NotFoundException(`Team with ID ${id} not found.`);
    }

    try {
      const team = await this.teamRepository.remove(id);
      this.logger.log(`Team ${id} deleted successfully.`);
      return team;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to delete team ${id}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(`Failed to delete team ${id}.`);
    }
  }

  async addMember(id: number, memberDto: MemberDto, user: User): Promise<Member | undefined> {
    return await this.teamRepository.addMember(id, memberDto);
  }

  async deleteMember(teamId: number, memberId: number, user: User): Promise<{ message: string; member: Member | null } | undefined> {
    return await this.teamRepository.deleteMember(teamId, memberId);
  }
}
