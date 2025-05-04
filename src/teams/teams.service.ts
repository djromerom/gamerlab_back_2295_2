import { Injectable } from '@nestjs/common';
import { CreateTeamDto, MemberDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from 'src/auth/dto/Register.dto';
import { connect } from 'http2';

@Injectable()
export class TeamsService {
  constructor (private authService : AuthService, private prismaService : PrismaService) {}
  
  async create(createTeamDto: CreateTeamDto) {
    
    const userRegister : RegisterDto = ({
      name: createTeamDto.members[0].memberName,
      email: createTeamDto.members[0].memberEmail
    }); // Get the first member's name and email

    const { teamName, videogame } = createTeamDto;
    const { user } = await this.authService.registerUser(userRegister);

    const dataUser = await this.prismaService.user.create({    // --> Create the user in the database
      data: { 
        id: user.id,
        name: userRegister.name,
        email: userRegister.email,
        roleId: 2, // Role ID for student
      }
    });

    const team = await this.prismaService.team.create({    // --> Create the team in the database
      data: {
        teamName: teamName,
        userId: user.id, // ID of the first member (user)
      }
    });

    // 4. Crear miembros (con Promise.all)
  const members = await Promise.all(
    createTeamDto.members.map(member => {
      const [firstName, ...lastNameParts] = member.memberName.split(' ');
      const lastName = lastNameParts.join(' ');

      return this.prismaService.member.create({
        data: {
          firstName,
          lastName,
          email: member.memberEmail,
          studentCode: member.studentCode,
          teamId: team.id,
          nrcs: {
            connect: member.nrc.map(code => ({ code: parseInt(code) })),
          },
        },
      });
    })
  );

    // Create videogame in the database
    const vg = await this.prismaService.videogame.create({
      data: {
        name: videogame.vgName,
        description: videogame.description,
        logoUrl: videogame.logoURL,
        teamId: team.id, // ID of the team
        videogameStatusId: 2, // Status ID for "pending"
      },
    });

    return { dataUser, team, members, vg }; // Return the created team and members
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
