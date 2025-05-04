import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class NrcsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.nRC.findMany({
      where: { isActive: true },
      include: {
        subject: true,
        professor: true,
        members: true,
      },
    });
  }

  async findOne(id: number) {
    const nrc = await this.prisma.nRC.findUnique({
      where: { id },
      include: {
        subject: true,
        professor: true,
        members: true,
      },
    });

    if (!nrc || !nrc.isActive) {
      throw new NotFoundException('NRC no encontrado o inactivo');
    }

    return nrc;
  }

  async create(data: Prisma.NRCCreateInput) {
    return this.prisma.nRC.create({
      data,
      include: { subject: true, professor: true },
    });
  }

  async update(id: number, data: Prisma.NRCUpdateInput) {
    return this.prisma.nRC.update({
      where: { id },
      data,
      include: {
        subject: true,
        professor: true,
      },
    });
  }

  // Soft delete: set isActive to false
  async remove(id: number) {
    const nrc = await this.prisma.nRC.findUnique({ where: { id } });
    if (!nrc || !nrc.isActive) {
      throw new NotFoundException('NRC no encontrado o ya inactivo');
    }

    return this.prisma.nRC.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
