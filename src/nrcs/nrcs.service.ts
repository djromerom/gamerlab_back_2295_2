import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { assertNrcWritable, findActiveEdition } from '../editions/active-edition';
import { ListEdition, resolveListEdition } from '../editions/list-edition';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, NRC } from '@prisma/client';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { SelectOption } from './types/select-option.type';
import { CreateNrcDto } from './dto/create-nrc.dto';
import { UpdateNrcDto } from './dto/update-nrc.dto';

@Injectable()
export class NrcsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ARK-136 (BG-23): lista del administrador. Solo los NRC de la edición pedida o, por defecto,
   * la activa (antes mezclaba todas las ediciones). Sin edición activa, lista vacía. `edition`
   * (con `readOnly`) le dice al front si la edición se consulta como historial.
   */
  async findAll(
    includeInactive: boolean,
    limit: number,
    page: number,
    editionId?: number,
  ): Promise<PaginatedResult<NRC> & { edition: ListEdition | null }> {
    const edition = await resolveListEdition(this.prisma, editionId);
    if (!edition) {
      return {
        data: [],
        metadata: {
          totalItems: 0,
          itemsOnCurrentPage: 0,
          currentPage: page,
          itemsPerPage: limit,
          totalPages: 0,
        },
        edition: null,
      };
    }

    const offset = (page - 1) * limit;

    const whereClause: Prisma.NRCWhereInput = { editionId: edition.id };

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
      edition,
    };
  }

  /**
   * ARK-136 (BG-23): si la edición activa ya tiene NRC activos. El panel lo consulta antes de abrir
   * las inscripciones: sin NRC nadie puede terminar de inscribirse (el equipo exige al menos uno).
   * Solo informa; abrir las inscripciones no se bloquea en el back.
   */
  async registrationReadiness(): Promise<{
    edition: { id: number; title: string } | null;
    activeNrcCount: number;
    hasActiveNrcs: boolean;
  }> {
    const edition = await findActiveEdition(this.prisma);
    if (!edition) return { edition: null, activeNrcCount: 0, hasActiveNrcs: false };
    const activeNrcCount = await this.prisma.nRC.count({
      where: { editionId: edition.id, isActive: true },
    });
    return {
      edition: { id: edition.id, title: edition.title },
      activeNrcCount,
      hasActiveNrcs: activeNrcCount > 0,
    };
  }

  async findForSelect(
    includeSubjects: boolean = false,
  ): Promise<SelectOption[]> {
    const activeEdition = await findActiveEdition(this.prisma);

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

    const activeEdition = await findActiveEdition(this.prisma);

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

    try {
      return await this.prisma.nRC.create({
        data: {
          code,
          edition: { connect: { id: activeEdition.id } },
          subject: { connect: { id: subjectId } },
          professor: { connect: { id: professorId } },
          ...(isActive !== undefined && { isActive }),
        },
        include: { subject: true, professor: true, edition: true },
      });
    } catch (error) {
      this.rethrowDuplicateNrc(error, code);
    }
  }

  async update(id: number, dto: UpdateNrcDto) {
    const existingNrc = await this.prisma.nRC.findUnique({
      where: { id },
    });

    if (!existingNrc) {
      throw new NotFoundException(`NRC con ID ${id} no encontrado.`);
    }

    // ARK-130 (HU-27): los NRC de ediciones anteriores son de solo lectura
    await assertNrcWritable(this.prisma, id);

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

    try {
      return await this.prisma.nRC.update({
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
    } catch (error) {
      this.rethrowDuplicateNrc(error, dto.code ?? existingNrc.code);
    }
  }

  // El índice único parcial (codigo, id_edicion) WHERE activo rechaza la
  // carrera entre la verificación previa y la escritura.
  private rethrowDuplicateNrc(error: unknown, code: number): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `Ya existe un NRC activo con el código ${code} en esta edición.`,
      );
    }
    throw error;
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

    await assertNrcWritable(this.prisma, id);

    return this.prisma.nRC.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
