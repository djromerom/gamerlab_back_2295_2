import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Criterion } from '@prisma/client';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { SelectOption } from './types/select-option.type';

@Injectable()
export class CriterionService {
  constructor(private prisma: PrismaService) {}

  async create(createCriterionDto: CreateCriterionDto) {
    return this.prisma.criterion.create({
      data: {
        name: createCriterionDto.name,
        description: createCriterionDto.description,
        weight: createCriterionDto.weight,
        isActive: true,
      },
    });
  }

  async findAll(
  includeInactive: boolean,
  limit: number,
  page: number,
): Promise<PaginatedResult<Criterion>> {
  const offset = (page - 1) * limit;

  const whereClause: Prisma.CriterionWhereInput = {};

  if (!includeInactive) whereClause.isActive = true;

  const [items, totalItems, weightSum] = await this.prisma.$transaction([
    this.prisma.criterion.findMany({
      where: whereClause,
      skip: offset,
      take: limit,
    }),
    this.prisma.criterion.count({ where: whereClause }),
    this.prisma.criterion.aggregate({
      where: whereClause,
      _sum: { weight: true },
    }),
  ]);

  const totalPages = Math.ceil(totalItems / limit);

  return {
    data: items,
    metadata: {
      totalItems: totalItems,
      itemsOnCurrentPage: items.length,
      currentPage: page,
      itemsPerPage: limit,
      totalPages: totalPages,
      totalWeight: weightSum._sum.weight || 0, // Mueve esto dentro de metadata
    },
  };
}

  async findForSelect(): Promise<SelectOption[]> {
    const criterions = this.prisma.criterion.findMany({
      where: { isActive: true },
      select: { id: true, name: true, weight: true, description: true },
    });

    return criterions;
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
