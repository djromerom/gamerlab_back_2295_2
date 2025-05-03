import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';



@Injectable()
export class JurorService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly JUROR_ROLE_ID = 4;

  async create(dto: CreateJurorDto):Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        roleId: this.JUROR_ROLE_ID,
        isActive: true,
        confirmationStatusId: 2,
      },
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      where: { roleId: this.JUROR_ROLE_ID, isActive: true },
    });
  }

  async findOne(id: string):Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
  
    if (!user) {
      throw new NotFoundException('User not found');
    }
  
    if (user.roleId !== this.JUROR_ROLE_ID) {
      throw new NotFoundException('User is not a juror');
    }
  
    return user;
  }

  async getJurorSummary(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        evaluationsSubmitted: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user || user.roleId !== this.JUROR_ROLE_ID) {
      throw new NotFoundException('Juror not found');
    }
    const confirmationStatusMap = {
      1: 'Confirmado',
      2: 'Pendiente',
      3: 'Expirado',
    };

    const confirmationStatusString = user.confirmationStatusId != null
    ? confirmationStatusMap[user.confirmationStatusId] || 'Unknown'
    : 'Unknown';

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      confirmationStatus: user.confirmationStatusId,
      reviewedGames: user.evaluationsSubmitted.length,
      lastConnection: user.updatedAt,
    };
  }

  async update(id: string, dto: UpdateJurorDto):Promise<User> {
    const user = await this.findOne(id);

    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictException('Email is already in use by another user');
      }
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: dto,
    });
  }

  async remove(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: false,
        confirmationStatusId: 3 
        }, 
    });
  }
}
