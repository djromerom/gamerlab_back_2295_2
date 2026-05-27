import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEducationalFocusDto } from './dto/create-educational-focus.dto';
import { UpdateEducationalFocusDto } from './dto/update-educational-focus.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { EducationalFocus } from '@prisma/client';

@Injectable()
export class EducationalFocusesService {

  private readonly logger = new Logger(EducationalFocusesService.name);

  constructor(private prisma: PrismaService) { }

  async create(editionId: number, createEducationalFocusDto: CreateEducationalFocusDto) {
    return this.prisma.educationalFocus.create({
      data: {
        editionId,
        ...createEducationalFocusDto,
      },
    });
  }

  async findAll(editionId: number, query: PaginationQueryDto): Promise<PaginatedResult<EducationalFocus>> {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.educationalFocus.findMany({
        where: { editionId },
        skip: offset,
        take: limit,
      }),
      this.prisma.educationalFocus.count({
        where: { editionId },
      }),
    ]);

    this.logger.log(`Educational Focuses found for edition #${editionId}`);
    this.logger.log(`Total items: ${totalItems}`);
    this.logger.log(`Total pages: ${Math.ceil(totalItems / limit)}`);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: items,
      metadata: {
        totalItems,
        itemsOnCurrentPage: items.length,
        currentPage: page,
        itemsPerPage: limit,
        totalPages,
      },
    };
  }

  async findOne(editionId: number, id: number) {
    const focus = await this.prisma.educationalFocus.findFirst({
      where: { id, editionId },
    });
    if (!focus) {
      throw new NotFoundException(`Educational Focus #${id} not found in edition #${editionId}`);
    }
    return focus;
  }

  async update(editionId: number, id: number, updateEducationalFocusDto: UpdateEducationalFocusDto) {
    await this.findOne(editionId, id);
    return this.prisma.educationalFocus.update({
      where: { id },
      data: updateEducationalFocusDto,
    });
  }

  async remove(editionId: number, id: number) {
    await this.findOne(editionId, id);
    return this.prisma.educationalFocus.delete({
      where: { id },
    });
  }
}
