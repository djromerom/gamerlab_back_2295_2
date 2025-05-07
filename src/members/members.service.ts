import { Injectable, BadRequestException  } from '@nestjs/common';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}
  async create(teamId: number, createMemberDto: CreateMemberDto) {
    // Validar que el equipo exista
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });
    if (!team) throw new BadRequestException('Equipo no encontrado');

    // Validar correo institucional
    if (!createMemberDto.email.endsWith('@uni.edu')) {
      throw new BadRequestException('Solo correos institucionales permitidos');
    }

    return this.prisma.member.create({
      data: {
        ...createMemberDto,
        teamId: teamId,
      },
    });
  }

  findAll() {
    return `This action returns all members`;
  }

  findOne(id: number) {
    return `This action returns a #${id} member`;
  }

  update(id: number, updateMemberDto: UpdateMemberDto) {
    return `This action updates a #${id} member`;
  }

  remove(id: number) {
    return `This action removes a #${id} member`;
  }
}