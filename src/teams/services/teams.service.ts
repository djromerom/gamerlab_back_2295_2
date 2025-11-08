/* eslint-disable prettier/prettier */
// src/teams/services/teams.service.ts
import { Injectable, Logger, ConflictException, InternalServerErrorException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { UpdateTeamInfoDto } from '../dto/update-team-info.dto';
import { UpdateMemberEmailDto } from '../dto/update-member-email.dto';
import { RegisterUserDto } from '../dto/register-user.dto';
import { TeamRepository } from '../repositories/team.repository';
import { RecaptchaService } from './recaptcha.service';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { User } from '@prisma/client';
import { AppUser } from '../../auth/jwt.strategy';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly teamRepository: TeamRepository,
    private readonly recaptchaService: RecaptchaService,
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
    // Verificar el token de reCAPTCHA desde el backend y lanzar una excepción si falla
    try {
      const isRecaptchaValid = await this.recaptchaService.verify(createTeamDto.recaptchaToken);
      if (!isRecaptchaValid) {
        throw new UnauthorizedException('reCAPTCHA verification failed');
      }
    } catch (error) {
      this.logger.error(
        `reCAPTCHA verification error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new UnauthorizedException('Error en la verificación de reCAPTCHA');
    }

    const firstMember = createTeamDto.members[0];
    
    // Check if the email already exists 
    const existingEmails = await this.teamRepository.checkEmailsExist([firstMember.memberEmail]);
    if (existingEmails[firstMember.memberEmail]) {
      throw new ConflictException(`The email ${firstMember.memberEmail} is already in use.`);
    }
    
    // Check for duplicate student codes
    const studentCodeMap = new Map<string, boolean>();
    const studentCodes: string[] = [];

    for (const member of createTeamDto.members) {
      if (studentCodeMap.has(member.studentCode)) {
        throw new ConflictException(`Duplicate student code: ${member.studentCode} within request`);
      }
      studentCodeMap.set(member.studentCode, true);
      
      studentCodes.push(member.studentCode);
    }

    const existingStudentCodes = await this.teamRepository.findExistingStudentCodes(studentCodes);
    for (const member of createTeamDto.members) {
      if (existingStudentCodes.has(member.studentCode)) {
        throw new ConflictException(`Student code ${member.studentCode} is already in use.`);
      }
    }
    
    // Attempt to register the user in the DB
    let user: User;
    try {
      user = await this.authService.registerUser({
        email: firstMember.memberEmail,
      });
      
      if (!user || !user.id) {
        throw new InternalServerErrorException('User registration failed.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown registration error';
      if (errorMessage.toLowerCase().includes('user already registered')) {
        throw new ConflictException(`Email ${firstMember.memberEmail} is already registered.`);
      }
      throw new InternalServerErrorException(`Error: ${errorMessage}`);
    }
    
    // Create the team using repository
    const result = await this.teamRepository.createTeam(createTeamDto, user.id);
    
    // Send confirmation email (moved out to email service)
    // Removed dependency from this service
    
    return result;
  }

  async registerUser(registerDto: RegisterUserDto) {
    const authRegisterPayload = {
      email: registerDto.email,
      name: registerDto.name,
    };
    
    return this.authService.registerUser(authRegisterPayload);
  }

  async findAll() {
    return this.teamRepository.findAll();
  }

  async findOne(id: number): Promise<unknown> {
    return await this.teamRepository.findOne(id);
  }

  async findOneWithDetails(identifier: string): Promise<unknown> {
    let team = await this.teamRepository.findOneWithDetailsByLeaderId(identifier);

    if (!team && /^\d+$/.test(identifier)) {
      const numericId = Number(identifier);
      team = await this.teamRepository.findOneWithDetails(numericId);
    }

    if (!team) {
      throw new NotFoundException(`Equipo con líder o ID ${identifier} no encontrado`);
    }

    return team;
  }

  async update(id: number, updateTeamDto: UpdateTeamDto) {
    return this.teamRepository.update(id, updateTeamDto);
  }

  async updateTeamInfo(id: number, updateTeamInfoDto: UpdateTeamInfoDto, currentUser: AppUser) {
    // Verificar que el equipo existe y que el usuario es el líder
    const team = await this.teamRepository.findOne(id);
    if (!team) {
      throw new NotFoundException(`Equipo con ID ${id} no encontrado`);
    }

    const isAdmin = await this.teamRepository.isRole(currentUser?.roleId, 'Administrador');

    if (team.userId !== currentUser.id && !isAdmin) {
      throw new UnauthorizedException('Solo el líder del equipo o un administrador puede actualizar la información');
    }

    return this.teamRepository.updateTeamInfo(id, updateTeamInfoDto);
  }

  async updateMemberEmail(teamId: number, memberId: number, updateMemberEmailDto: UpdateMemberEmailDto, userId: string) {
    // Verificar que el equipo existe y que el usuario es el líder
    const team = await this.teamRepository.findOne(teamId);
    if (!team) {
      throw new NotFoundException(`Equipo con ID ${teamId} no encontrado`);
    }

    if (team.userId !== userId) {
      throw new UnauthorizedException('Solo el líder del equipo puede actualizar los emails de los integrantes');
    }

    // Verificar que el miembro existe y pertenece al equipo
    const member = await this.teamRepository.findMemberById(memberId);

    if (!member) {
      throw new NotFoundException(`Integrante con ID ${memberId} no encontrado`);
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
      throw new BadRequestException('No se puede cambiar el email del líder usando este endpoint');
    }

    if (leaderUser && leaderUser.email === updateMemberEmailDto.email) {
      throw new BadRequestException('No se puede usar el email del líder para un integrante');
    }

    try {
      return await this.teamRepository.updateMemberEmail(memberId, updateMemberEmailDto.email, teamId);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Email already in use') {
          throw new ConflictException('El email ya está en uso');
        }
        if (error.message === 'Team not found' || error.message === 'Member not found in team') {
          throw new NotFoundException(error.message);
        }
      }
      throw new InternalServerErrorException('Error al actualizar el email del integrante');
    }
  }

  async getTeamsWithLessThanThreeJurors(): Promise<any[]> {
    return this.teamRepository.getTeamsWithLessThanThreeJurors();
  }

  async remove(id: number) {
    return this.teamRepository.remove(id);
  }
}