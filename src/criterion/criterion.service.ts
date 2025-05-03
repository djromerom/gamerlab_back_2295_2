import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCriterionDto } from './dto/create-criterion.dto';

@Injectable()
export class CriterionService {
  constructor(private prisma: PrismaService) {}

  async create(createCriterionDto: CreateCriterionDto) {
    return this.prisma.criterion.create({
      data: {
        name: createCriterionDto.name,
        description: createCriterionDto.description,
        weight: createCriterionDto.weight,
        isActive: true, // Por defecto activo al crear
      },
    });
  }

  async findAll(includeInactive: boolean = false) {
    return this.prisma.criterion.findMany({
      where: includeInactive ? undefined : { isActive: true },
    });
  }

  async findOne(id: number) {
    return this.prisma.criterion.findUnique({
      where: { id },
    });
  }

  async update(id: number, updateData: Partial<CreateCriterionDto>) {
    return this.prisma.criterion.update({
      where: { id },
      data: {
        name: updateData.name,
        description: updateData.description,
        weight: updateData.weight,
      },
    });
  }

  async softDelete(id: number) {
    return this.prisma.criterion.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async restore(id: number) {
    return this.prisma.criterion.update({
      where: { id },
      data: { isActive: true },
    });
  }
}