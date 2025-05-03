import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamWithMembersDto } from './dto/create-team-with-members.dto';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  // src/teams/teams.service.ts
  async create(createTeamDto: CreateTeamDto) {
    // Validación adicional (por si falla el pipe global)
    if (!createTeamDto.teamName || !createTeamDto.ownerId) {
      throw new BadRequestException('Datos incompletos: teamName y ownerId son requeridos');
    }

    return this.prisma.team.create({
      data: {
        teamName: createTeamDto.teamName,
        ownerId: createTeamDto.ownerId,
        // Los demás campos (isConfirmed, registrationDate) se llenan solos
      },
    });
}

async createTeamWithMembers(dto: CreateTeamWithMembersDto) {
  // 1. Crear equipo (asignamos ownerId fijo para pruebas)
  const team = await this.prisma.team.create({
    data: {
      teamName: dto.teamName,
      userId: "aleja", // ID fijo de pruebas
    },
  });

  // 2. Crear miembros
  for (const member of dto.members) {
    const [firstName, ...lastNameParts] = member.nombre.split(' ');
    const lastName = lastNameParts.join(' ');

    await this.prisma.member.create({
      data: {
        firstName,
        lastName,
        email: member.correo,
        studentCode: member.codigoEstudiantil,
        teamId: team.id,
        nrcs: {
          connect: member.nrc.map(code => ({ code: parseInt(code) })),
        },
      },
    });
  }

  return team;
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