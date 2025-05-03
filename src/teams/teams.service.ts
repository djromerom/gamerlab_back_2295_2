import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import { MailerService } from '@nestjs-modules/mailer';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService,
              private readonly mailerService: MailerService) {}
  
  private readonly student_role_id = 2;

  // src/teams/teams.service.ts
  async create(createTeamDto: CreateTeamDto) {
    
    const existing_email = await this.prisma.user.findUnique({ where: { email: createTeamDto.email } });
    if (existing_email) {
      throw new ConflictException('Correo ya registrado');
    }

    const existing_team_name = await this.prisma.team.findUnique({ where: { teamName: createTeamDto.teamName } });
    if (existing_team_name) {
      throw new ConflictException('Nombre de equipo ya registrado');
    }

    const existing_student_code = await this.prisma.member.findUnique({ where: { studentCode: createTeamDto.studentCode } });
    if (existing_student_code) {
      throw new ConflictException('Código de estudiante ya registrado');
    }
    
    const confirmationToken = uuidv4(); // Genera un token único (UUID)

    const user = await this.prisma.user.create({
      data: {
        name: createTeamDto.name,
        confirmationToken,
        isConfirmed: false,
        roleId: this.student_role_id,
      },
    });

    return this.prisma.team.create({
      data: {
        teamName: createTeamDto.teamName,
        ownerId: createTeamDto.ownerId,
        // Los demás campos (isConfirmed, registrationDate) se llenan solos
      },
    });
}

async createTeamWithMembers(dto: CreateTeamWithMembersDto) {
  return this.prisma.$transaction(async (prisma) => {
    // 1. Crear equipo
    const team = await prisma.team.create({
      data: {
        teamName: dto.teamName,
        ownerId: "pepitojm", // Reemplazar con lógica real
        id_edicion: 1,
      },
    });

    // 2. Crear miembros y conectarlos a NRCs
    await Promise.all(
      dto.members.map(async (member) => {
        const newMember = await prisma.member.create({
          data: {
            name: member.nombre,
            email: member.correo,
            studentCode: member.codigoEstudiantil,
            teamId: team.id,
            nrcs: {
              connect: member.nrc.map(nrcCode => ({ code: parseInt(nrcCode) })),
            },
          },
        });
      })
    );

    return team;
  });
}

  async findAll() {
    return this.prisma.team.findMany();
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