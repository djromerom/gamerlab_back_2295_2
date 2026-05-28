import { Injectable, NotFoundException, Logger, InternalServerErrorException } from '@nestjs/common';
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
    this.logger.log(`Creating educational focus for edition #${editionId}`);
    this.logger.debug(`Payload: ${JSON.stringify(createEducationalFocusDto)}`);
    try {
      const result = await this.prisma.educationalFocus.create({
        data: {
          editionId,
          ...createEducationalFocusDto,
        },
      });
      this.logger.log(`Educational focus #${result.id} created successfully for edition #${editionId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error creating educational focus for edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al crear el enfoque educativo.');
    }
  }

  async findAll(editionId: number, query: PaginationQueryDto): Promise<PaginatedResult<EducationalFocus>> {
    const { limit, page } = query;
    const offset = (page - 1) * limit;

    this.logger.log(`Fetching educational focuses for edition #${editionId} — page ${page}, limit ${limit}`);

    try {
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

      const totalPages = Math.ceil(totalItems / limit);

      this.logger.log(`Found ${items.length} educational focuses (total: ${totalItems}, pages: ${totalPages}) for edition #${editionId}`);

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
        `Error fetching educational focuses for edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al obtener los enfoques educativos.');
    }
  }

  async findOne(editionId: number, id: number) {
    this.logger.log(`Looking up educational focus #${id} in edition #${editionId}`);
    const focus = await this.prisma.educationalFocus.findFirst({
      where: { id, editionId },
    });
    if (!focus) {
      this.logger.warn(`Educational focus #${id} not found in edition #${editionId}`);
      throw new NotFoundException(`Educational Focus #${id} not found in edition #${editionId}`);
    }
    this.logger.debug(`Educational focus #${id} found in edition #${editionId}`);
    return focus;
  }

  async update(editionId: number, id: number, updateEducationalFocusDto: UpdateEducationalFocusDto) {
    this.logger.log(`Updating educational focus #${id} in edition #${editionId}`);
    this.logger.debug(`Update payload: ${JSON.stringify(updateEducationalFocusDto)}`);
    await this.findOne(editionId, id);
    try {
      const result = await this.prisma.educationalFocus.update({
        where: { id },
        data: updateEducationalFocusDto,
      });
      this.logger.log(`Educational focus #${id} updated successfully in edition #${editionId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error updating educational focus #${id} in edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al actualizar el enfoque educativo.');
    }
  }

  async remove(editionId: number, id: number) {
    this.logger.log(`Deleting educational focus #${id} from edition #${editionId}`);
    await this.findOne(editionId, id);
    try {
      await this.prisma.educationalFocus.delete({ where: { id } });
      this.logger.log(`Educational focus #${id} deleted successfully from edition #${editionId}`);
    } catch (error) {
      this.logger.error(
        `Error deleting educational focus #${id} from edition #${editionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Error interno al eliminar el enfoque educativo.');
    }
  }
}
