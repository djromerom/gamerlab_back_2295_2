import { Injectable, NotFoundException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTestimonialDto } from './dto/create-testimonial.dto';
import { UpdateTestimonialDto } from './dto/update-testimonial.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { Testimonial } from '@prisma/client';

@Injectable()
export class TestimonialsService {

  private readonly logger = new Logger(TestimonialsService.name);

  constructor(private prisma: PrismaService) { }

  async create(editionId: number, createTestimonialDto: CreateTestimonialDto) {
    this.logger.log(`Creating testimonial for edition #${editionId}`);
    this.logger.debug(`Payload: ${JSON.stringify(createTestimonialDto)}`);
    try {
      const result = await this.prisma.testimonial.create({
        data: {
          editionId,
          ...createTestimonialDto,
        },
      });
      this.logger.log(`Testimonial #${result.id} created successfully for edition #${editionId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error creating testimonial for edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al crear el testimonio.');
    }
  }

  async findAll(editionId: number, query: PaginationQueryDto): Promise<PaginatedResult<Testimonial>> {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

    this.logger.log(`Fetching testimonials for edition #${editionId} — page ${page}, limit ${limit}`);

    try {
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

      this.logger.log(`Found ${items.length} testimonials (total: ${totalItems}, pages: ${totalPages}) for edition #${editionId}`);

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
    } catch (error) {
      this.logger.error(
        `Error fetching testimonials for edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al obtener los testimonios.');
    }
  }

  async findOne(editionId: number, id: number) {
    this.logger.log(`Looking up testimonial #${id} in edition #${editionId}`);
    const testimonial = await this.prisma.testimonial.findFirst({
      where: { id, editionId },
    });
    if (!testimonial) {
      this.logger.warn(`Testimonial #${id} not found in edition #${editionId}`);
      throw new NotFoundException(`Testimonial #${id} not found in edition #${editionId}`);
    }
    this.logger.debug(`Testimonial #${id} found in edition #${editionId}`);
    return testimonial;
  }

  async update(editionId: number, id: number, updateTestimonialDto: UpdateTestimonialDto) {
    this.logger.log(`Updating testimonial #${id} in edition #${editionId}`);
    this.logger.debug(`Update payload: ${JSON.stringify(updateTestimonialDto)}`);
    await this.findOne(editionId, id);
    try {
      const result = await this.prisma.testimonial.update({
        where: { id },
        data: updateTestimonialDto,
      });
      this.logger.log(`Testimonial #${id} updated successfully in edition #${editionId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error updating testimonial #${id} in edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al actualizar el testimonio.');
    }
  }

  async remove(editionId: number, id: number) {
    this.logger.log(`Deleting testimonial #${id} from edition #${editionId}`);
    await this.findOne(editionId, id);
    try {
      await this.prisma.testimonial.delete({ where: { id } });
      this.logger.log(`Testimonial #${id} deleted successfully from edition #${editionId}`);
    } catch (error) {
      this.logger.error(
        `Error deleting testimonial #${id} from edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al eliminar el testimonio.');
    }
  }
}
