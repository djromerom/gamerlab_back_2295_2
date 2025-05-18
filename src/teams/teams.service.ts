import { Injectable, Logger, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { CreateTeamDto, MemberDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, User, Role } from '@prisma/client';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { RegisterDto } from 'src/auth/dto/register.dto';
import { RegisterUserDto } from './dto/register-user.dto';

@Injectable()
export class TeamsService {

  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async findByTeamName(teamName: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        teamName: {
          equals: teamName,
          mode: 'insensitive',
        },
      },
    });

    return !!team; // Return true if the team exists, false otherwise
  }

  // Validate if videogame exists (case-insensitive)
  async findByVideogameName(videogameName: string) {
    const videogame = await this.prisma.videogame.findFirst({
      where: {
        name: {
          equals: videogameName,
          mode: 'insensitive',
        },
      },
    });

    return !!videogame; // true if found, false if not
  }

  async create(createTeamDto: CreateTeamDto) {
    const firstMember = createTeamDto.members[0];

    // Check if the email already exists in your local DB
    const existingUserByEmail = await this.prisma.user.findUnique({
      where: {
        email: firstMember.memberEmail,
      },
    });

    if (existingUserByEmail) {
      throw new ConflictException(`The email ${firstMember.memberEmail} is already in use.`);
    }

    // Check for duplicate student codes before doing anything else
    for (const member of createTeamDto.members) {
      const existingMember = await this.prisma.member.findUnique({
        where: { studentCode: member.studentCode },
      });
      if (existingMember) {
        throw new ConflictException(`Student code ${member.studentCode} is already in use.`);
      }
    }

    // Attempt to register the user in Supabase
    let supabaseUser: SupabaseUser;
    try {
      supabaseUser = await this.authService.registerUser({
        email: firstMember.memberEmail,
      });

      if (!supabaseUser || !supabaseUser.id) {
        throw new InternalServerErrorException('User registration failed.');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown Supabase registration error';
      if (errorMessage.toLowerCase().includes('user already registered')) {
        throw new ConflictException(`Email ${firstMember.memberEmail} is already registered.`);
      }
      throw new InternalServerErrorException(`Supabase error: ${errorMessage}`);
    }

    // All validations passed → continue inside a transaction
    try {
      const { teamName, videogame } = createTeamDto;

      const result = await this.prisma.$transaction(async (tx) => {
        const studentRole = await tx.role.findUnique({
          where: { name: 'Estudiante' },
        });

        if (!studentRole) {
          throw new Error('Role "Estudiante" not found.');
        }

        const createdUser = await tx.user.create({
          data: {
            id: supabaseUser.id,
            firstName: firstMember.memberFirstName,
            lastName: firstMember.memberLastName,
            email: firstMember.memberEmail,
            roleId: studentRole.id,
          },
        });

        const team = await tx.team.create({
          data: {
            teamName,
            userId: createdUser.id,
          },
        });

        const members = await Promise.all(
          createTeamDto.members.map((member) => {
            tx.member.create({
              data: {
                firstName: member.memberFirstName,
                lastName: member.memberLastName,
                email: member.memberEmail,
                studentCode: member.studentCode,
                teamId: team.id,
                nrcs: {
                  connect: member.nrc.map((code) => ({ id: parseInt(code) })),
                },
              },
            });
          }),
        );

        const createdVideogame = await tx.videogame.create({
          data: {
            name: videogame.vgName,
            description: videogame.description,
            logoUrl: videogame.logoURL,
            teamId: team.id,
            videogameStatusId: 1,
          },
        });

        return { createdUser, team, members, createdVideogame };
      });

      // Send confirmation email only if everything above succeeds
      // await this.emailService.sendConfirmation(result.team);

      return result;
    } catch (err) {
      this.logger.error('Transaction failed:', err);
      throw new InternalServerErrorException('Failed to create team.');
    }
  }

  async registerUser(registerDto: RegisterUserDto) {
    const authRegisterPayload = {
      email: registerDto.email,
      name: registerDto.name,
    };
    const user: SupabaseUser =
      await this.authService.registerUser(authRegisterPayload);
    return user;
  }

  findAll() {
    return `This action returns all teams`;
  }

  findOne(id: number) {
    return `This action returns a #${id} team`;
  }

  update(id: number, updateTeamDto: UpdateTeamDto) {
    return `This action updates a #${id} team`;
  }

  remove(id: number) {
    return `This action removes a #${id} team`;
  }
}
