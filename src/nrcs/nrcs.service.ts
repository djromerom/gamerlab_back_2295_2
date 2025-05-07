import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, NRC } from '@prisma/client';
import { PaginatedResult } from 'src/common/types/paginated-result.type';


@Injectable()
export class NrcsService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(includeInactive: boolean, limit: number, page: number): Promise<PaginatedResult<NRC>> {

    const offset = (page - 1) * limit;

    const whereClause: Prisma.NRCWhereInput = {};

    if (!includeInactive)
      whereClause.isActive = true;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.nRC.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        include: {
          subject: true,
          professor: true,
          members: true
        }
      }),
      this.prisma.nRC.count({
        where: whereClause
      })
    ])

    const totalPages = Math.ceil(totalItems / limit)

    return {
      data: items,
      metadata: {
        totalItems: totalItems,
        itemsOnCurrentPage: items.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages: totalPages,
      }
    }
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
      throw new NotFoundException('NRC not found or inactive');
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
