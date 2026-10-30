import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, NRC, EditionStatus } from '@prisma/client';
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
    const activeEdition = await this.prisma.edition.findFirst({
      where: { status: EditionStatus.ACTIVE },
      orderBy: { id: 'desc' },
      select: { id: true },
    });

    let selectClause: Prisma.NRCSelect = {
      id: true,
      code: true,
      subjectId: true,
      editionId: true,
    };

    if (includeSubjects)
      selectClause['subject'] = {
        select: { id: true, name: true },
      };

    const nrcs = await this.prisma.nRC.findMany({
      where: {
        isActive: true,
        ...(activeEdition ? { editionId: activeEdition.id } : { id: -1 }),
      },
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

    const activeEdition = await this.prisma.edition.findFirst({
      where: {
        status: EditionStatus.ACTIVE,
      },
      orderBy: {
        id: 'desc',
      },
      select: {
        id: true,
      },
    });

    if (!activeEdition) {
      throw new BadRequestException('No hay una edición activa configurada');
    }

    // Check for existing ACTIVE NRC with the same code
    const existingNrc = await this.prisma.nRC.findFirst({
      where: {
        code,
        isActive: true,
        editionId: activeEdition.id,
      },
    });

    if (existingNrc) {
      throw new ConflictException(
        `Ya existe un NRC con el código ${code} en la edición activa.`,
      );
    }

    return this.prisma.nRC.create({
      data: {
        code,
        edition: { connect: { id: activeEdition.id } },
        subject: { connect: { id: subjectId } },
        professor: { connect: { id: professorId } },
        ...(isActive !== undefined && { isActive }),
      },
      include: { subject: true, professor: true, edition: true },
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
          isActive: true,
          editionId: existingNrc.editionId,
        },
      });

      if (conflictingNrc) {
        throw new ConflictException(
          `Ya existe otro NRC con el código ${dto.code} en esta edición.`,
        );
      }
    }

    const { subjectId, professorId, ...rest } = dto;

    return this.prisma.nRC.update({
      where: { id },
      data: {
        ...rest,
        ...(subjectId !== undefined && {
          subject: { connect: { id: subjectId } },
        }),
        ...(professorId !== undefined && {
          professor: { connect: { id: professorId } },
        }),
      },
      include: {
        subject: true,
        professor: true,
        edition: true,
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
