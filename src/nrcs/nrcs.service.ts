import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, NRC } from '@prisma/client';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { SelectOption } from './types/select-option.type';
import { CreateNrcDto } from './dto/create-nrc.dto';
import { UpdateNrcDto } from './dto/update-nrc.dto';

@Injectable()
export class NrcsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    includeInactive: boolean,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<NRC>> {
    const offset = (page - 1) * limit;

    const whereClause: Prisma.NRCWhereInput = {};

    if (!includeInactive) whereClause.isActive = true;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.nRC.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        include: {
          subject: true,
          professor: true,
          members: true,
        },
      }),
      this.prisma.nRC.count({
        where: whereClause,
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
      },
    };
  }

  async findForSelect(
    includeSubjects: boolean = false,
  ): Promise<SelectOption[]> {
    let selectClause: Prisma.NRCSelect = {
      id: true,
      code: true,
    };

    if (includeSubjects)
      selectClause['subject'] = {
        select: { id: true, name: true },
      };

    const nrcs = await this.prisma.nRC.findMany({
      where: { isActive: true },
      select: selectClause,
    });

    return nrcs;
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

    if (!nrc) {
      throw new NotFoundException(`NRC con ID ${id} no encontrado.`);
    }
    if (!nrc.isActive) {
      throw new ConflictException(`NRC con ID ${id} está inactivo.`);
    }

    return nrc;
  }

  async create(dto: CreateNrcDto) {
    const { code, subjectId, professorId, isActive } = dto;

    // Check for existing ACTIVE NRC with the same code
    const existingNrc = await this.prisma.nRC.findFirst({
      where: {
        code,
        isActive: true, // Solo verificar NRCs activos
      },
    });

    if (existingNrc) {
      throw new ConflictException(
        `Ya existe un NRC con el código ${code}.`,
      );
    }

    return this.prisma.nRC.create({
      data: {
        code,
        subject: { connect: { id: subjectId } },
        professor: { connect: { id: professorId } },
        ...(isActive !== undefined && { isActive }),
      },
      include: { subject: true, professor: true },
    });
  }

  async update(id: number, dto: UpdateNrcDto) {
    const existingNrc = await this.prisma.nRC.findUnique({
      where: { id },
    });

    if (!existingNrc) {
      throw new NotFoundException(`NRC con ID ${id} no encontrado.`);
    }

    // Check if the code is being updated and conflicts with another ACTIVE NRC
    if (dto.code !== undefined) {
      const conflictingNrc = await this.prisma.nRC.findFirst({
        where: {
          code: dto.code,
          id: { not: id },
          isActive: true, // Solo verificar contra NRCs activos
        },
      });

      if (conflictingNrc) {
        throw new ConflictException(
          `Ya existe otro NRC con el código ${dto.code}.`,
        );
      }
    }

    const { subjectId, professorId, ...rest } = dto;

    return this.prisma.nRC.update({
      where: { id },
      data: {
        ...rest,
        ...(subjectId !== undefined && { subject: { connect: { id: subjectId } } }),
        ...(professorId !== undefined && { professor: { connect: { id: professorId } } }),
      },
      include: {
        subject: true,
        professor: true,
      },
    });
  }

  async remove(id: number) {
    const nrc = await this.prisma.nRC.findUnique({
      where: { id },
    });

    if (!nrc) {
      throw new NotFoundException(`NRC con ID ${id} no encontrado.`);
    }
    if (!nrc.isActive) {
      throw new ConflictException(`NRC con ID ${id} ya está inactivo.`);
    }

    return this.prisma.nRC.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
