/* eslint-disable prettier/prettier */
// src/teams/services/teams.service.ts
import { Injectable, Logger, ConflictException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { RegisterUserDto } from '../dto/register-user.dto';
import { TeamRepository } from '../repositories/team.repository';
import { RecaptchaService } from './recaptcha.service';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, User, Role, NRC, Subject } from '@prisma/client';

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
    for (const member of createTeamDto.members) {
      if (studentCodeMap.has(member.studentCode)) {
        throw new ConflictException(`Duplicate student code: ${member.studentCode} within request`);
      }
      studentCodeMap.set(member.studentCode, true);
      
      // Check if student code exists in database
      const existingMember = await this.prisma.member.findUnique({
        where: { studentCode: member.studentCode },
      });
      if (existingMember) {
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

  async update(id: number, updateTeamDto: UpdateTeamDto) {
    return this.teamRepository.update(id, updateTeamDto);
  }

  async remove(id: number) {
    return this.teamRepository.remove(id);
  }
}