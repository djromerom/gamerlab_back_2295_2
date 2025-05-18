import { Injectable } from '@nestjs/common';
import { CreateTeamDto, MemberDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from '@prisma/client';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { RegisterDto } from 'src/auth/dto/register.dto';
import { Resend } from 'resend';
import { RegisterUserDto } from './dto/register-user.dto';
import { Resend } from 'resend';

@Injectable()
export class TeamsService {
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
    const userRegister: RegisterDto = {
      name:
        createTeamDto.members[0].memberFirstName +
        ' ' +
        createTeamDto.members[0].memberLastName,
      email: createTeamDto.members[0].memberEmail,
    }; // Get the first member's name and email

    const { teamName, videogame } = createTeamDto;

    const studentRole = await this.prisma.role.findUnique({
      where: { name: 'Estudiante' },
    });

    if (!studentRole) {
      throw new Error('Role "ESTUDIANTE" not found');
    }

    const user: SupabaseUser =
      await this.authService.registerUser(userRegister);

    const dataUser = await this.prisma.user.create({
      data: {
        id: user.id,
        username: userRegister.name,
        name: userRegister.name,
        email: userRegister.email,
        roleId: studentRole.id,
      },
    });

    const team = await this.prisma.team.create({
      // --> Create the team in the database
      data: {
        teamName: teamName,
        userId: user.id, // ID of the first member (user)
      },
    });

    const members = await Promise.all(
      createTeamDto.members.map((member) => {
        return this.prisma.member.create({
          data: {
            firstName: member.memberFirstName,
            lastName: member.memberLastName,
            email: member.memberEmail,
            studentCode: member.studentCode,
            teamId: team.id,
            nrcs: {
              connect: member.nrc.map((code) => ({ code: parseInt(code) })),
            },
          },
        });
      }),
    );

    // Create videogame in the database
    const createdVideogame = await this.prisma.videogame.create({
      data: {
        name: videogame.vgName,
        description: videogame.description,
        logoUrl: videogame.logoURL,
        teamId: team.id, // ID of the team
        videogameStatusId: 1, // Replace '1' with the appropriate status ID
      },
    });

    // TODO: send email to team representative

    return { dataUser, team, members, createdVideogame };
  }

  //TODO: remove sensitive variables from the codebase. I assume these are just for testing
  sendEmail(email: string, id: string, name: string) {
    const resend = new Resend('re_dP24beoj_2JuvsZwCCFUiEatdKxG6YwNK');

    const envio = resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Vive la feria UNINORTE!',
      html: `<a href="http://localhost:5173/verificar-cuenta/${id}">Hola ${name},</a>`,
    });
    console.log(email, id, name);

    return envio;
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
