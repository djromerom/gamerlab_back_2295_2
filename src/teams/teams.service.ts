import { Injectable } from '@nestjs/common';
import { CreateTeamDto, MemberDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
<<<<<<< HEAD
import { RegisterDto } from 'src/auth/dto/Register.dto';
=======
import { Role } from '@prisma/client';
import { RegisterDto } from 'src/auth/dto/register.dto';
>>>>>>> dev
import { Resend } from 'resend';
import { RegisterUserDto } from './dto/register-user.dto';

@Injectable()
export class TeamsService {
  constructor(
<<<<<<< HEAD
    private authService: AuthService,
    private prismaService: PrismaService,
=======
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
>>>>>>> dev
  ) {}

  async create(createTeamDto: CreateTeamDto) {
    const userRegister: RegisterDto = {
      name: createTeamDto.members[0].memberName,
      email: createTeamDto.members[0].memberEmail,
    }; // Get the first member's name and email

    const { teamName, videogame } = createTeamDto;
<<<<<<< HEAD
    const { user } = await this.authService.registerUser(userRegister);

    const dataUser = await this.prismaService.user.create({
=======

    const studentRole: Role = await this.prisma.role.findUnique({
      where: { name: 'ESTUDIANTE' },
    });

    const { user } = await this.authService.registerUser(userRegister);

    const dataUser = await this.prisma.user.create({
>>>>>>> dev
      // --> Create the user in the database
      data: {
        id: user.id,
        name: userRegister.name,
        email: userRegister.email,
<<<<<<< HEAD
        roleId: 2, // Role ID for student
      },
    });

    const team = await this.prismaService.team.create({
=======
        roleId: studentRole.id,
      },
    });

    const team = await this.prisma.team.create({
>>>>>>> dev
      // --> Create the team in the database
      data: {
        teamName: teamName,
        userId: user.id, // ID of the first member (user)
      },
    });

<<<<<<< HEAD
    // 4. Crear miembros (con Promise.all)
=======
>>>>>>> dev
    const members = await Promise.all(
      createTeamDto.members.map((member) => {
        const [firstName, ...lastNameParts] = member.memberName.split(' ');
        const lastName = lastNameParts.join(' ');

<<<<<<< HEAD
        return this.prismaService.member.create({
=======
        return this.prisma.member.create({
>>>>>>> dev
          data: {
            firstName,
            lastName,
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
<<<<<<< HEAD
    const vg = await this.prismaService.videogame.create({
=======
    const createdVideogame = await this.prisma.videogame.create({
>>>>>>> dev
      data: {
        name: videogame.vgName,
        description: videogame.description,
        logoUrl: videogame.logoURL,
        teamId: team.id, // ID of the team
<<<<<<< HEAD
        videogameStatusId: 2, // Status ID for "pending"
      },
    });

    //enviar correo al representante del equipo

    return { dataUser, team, members, vg }; // Return the created team and members
  }

=======
      },
    });

    // TODO: send email to team representative

    return { dataUser, team, members, createdVideogame };
  }

  //TODO: remove sensitive variables from the codebase. I assume these are just for testing
>>>>>>> dev
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
      password: registerDto.password,
      name: registerDto.name,
    };
    const { user } = await this.authService.registerUser(authRegisterPayload);
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
