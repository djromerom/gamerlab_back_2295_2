import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTestimonialDto } from './dto/create-testimonial.dto';
import { UpdateTestimonialDto } from './dto/update-testimonial.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { Testimonial } from '@prisma/client';

@Injectable()
export class TestimonialsService {
  constructor(private prisma: PrismaService) { }

  async create(editionId: number, createTestimonialDto: CreateTestimonialDto) {
    try {
      return await this.prisma.testimonial.create({
        data: {
          editionId,
          ...createTestimonialDto,
        },
      });
    } catch (error: any) {
      throw error;
    }
  }

  async findAll(editionId: number, query: PaginationQueryDto): Promise<PaginatedResult<Testimonial>> {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.testimonial.findMany({
        where: { editionId },
        skip: offset,
        take: limit,
      }),
      this.prisma.testimonial.count({
        where: { editionId },
      }),
    ]);

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
    const testimonial = await this.prisma.testimonial.findFirst({
      where: { id, editionId },
    });
    if (!testimonial) {
      throw new NotFoundException(`Testimonial #${id} not found in edition #${editionId}`);
    }
    return testimonial;
  }

  async update(editionId: number, id: number, updateTestimonialDto: UpdateTestimonialDto) {
    await this.findOne(editionId, id); // check if exists
    return this.prisma.testimonial.update({
      where: { id },
      data: updateTestimonialDto,
    });
  }

  async remove(editionId: number, id: number) {
    await this.findOne(editionId, id); // check if exists
    return this.prisma.testimonial.delete({
      where: { id },
    });
  }
}
