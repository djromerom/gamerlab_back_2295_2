// src/teams/services/teams.service.ts
import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { RegisterUserDto } from '../dto/register-user.dto';
import { TeamRepository } from '../repositories/team.repository';
import { RecaptchaService } from './recaptcha.service';
import { ValidateEmailsDto } from '../dto/validate-emails.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { Team } from '@prisma/client';

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
    // try {
    //   const isRecaptchaValid = await this.recaptchaService.verify(
    //     createTeamDto.recaptchaToken,
    //   );
    //   if (!isRecaptchaValid) {
    //     throw new UnauthorizedException('reCAPTCHA verification failed');
    //   }
    // } catch (error) {
    //   this.logger.error(
    //     `reCAPTCHA verification error: ${
    //       error instanceof Error ? error.message : String(error)
    //     }`,
    //   );
    //   throw new UnauthorizedException('Error en la verificación de reCAPTCHA');
    // }

    return await this.teamRepository.createTeam(createTeamDto);
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
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid team id');
    }
    return await this.teamRepository.findOne(id);
  }

  async update(id: number, updateTeamDto: UpdateTeamDto) {
    return this.teamRepository.update(id, updateTeamDto);
  }

  async findPaged(page: number, limit: number) {
    return await this.teamRepository.findPaged(page, limit);
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
}
