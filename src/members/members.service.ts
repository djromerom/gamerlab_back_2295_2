import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}
  async create(teamId: number, createMemberDto: CreateMemberDto) {
    // Validar que el equipo exista
    const team = await this.prisma.team.findUnique({
      where: { id: teamId, isActive: true },
    });
    if (!team)
      throw new NotFoundException(
        'The provided team was not found or is inactive',
      );

    // TODO: Change member email validation. This is not enough
    if (!createMemberDto.email.endsWith('@uni.edu')) {
      throw new BadRequestException('Only educational emails are allowed');
    }

    const { firstName, lastName, email, studentCode } = createMemberDto;
    return this.prisma.member.create({
      data: {
        firstName: firstName,
        lastName: lastName,
        email: email,
        studentCode: studentCode,
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
