import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Prisma, Subject } from '@prisma/client';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { SelectOption } from './types/select-option.type';

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) {}

  async create(createSubjectDto: CreateSubjectDto): Promise<Subject> {
    // Check for existing ACTIVE subject with the same name or code
    const existingSubject = await this.prisma.subject.findFirst({
      where: {
        AND: [
          { isActive: true },
          {
            OR: [
              { name: createSubjectDto.name },
              { code: createSubjectDto.code },
            ],
          },
        ],
      },
    });

    if (existingSubject) {
      let conflictFields = [];

      if (existingSubject.name === createSubjectDto.name) {
        conflictFields.push('nombre');
      }
      if (existingSubject.code === createSubjectDto.code) {
        conflictFields.push('código');
      }

      const fieldsMessage = conflictFields.join(' y ');
      throw new ConflictException(
        `Ya existe una materia con el mismo ${fieldsMessage}.`,
      );
    }

    return this.prisma.subject.create({
      data: {
        ...createSubjectDto,
        isActive: true, // Asegurar que se cree como activo
      },
    });
  }

  async findForSelect(): Promise<SelectOption[]> {
    const subjects = await this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });

    return subjects;
  }

  async findAll(
    includeInactive: boolean,
    limit: number,
    page: number,
  ): Promise<PaginatedResult<Subject>> {
    const offset = (page - 1) * limit;

    const whereClause: Prisma.SubjectWhereInput = {};

    if (!includeInactive) whereClause.isActive = true;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.subject.count({
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

  async findOne(id: number): Promise<Subject> {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
    });

    if (!subject) {
      throw new NotFoundException(`Materia con ID ${id} no encontrada.`);
    }

    return subject;
  }

  async update(
    id: number,
    updateSubjectDto: UpdateSubjectDto,
  ): Promise<Subject> {
    const existingSubject = await this.prisma.subject.findUnique({
      where: { id },
    });

    if (!existingSubject) {
      throw new NotFoundException(`Materia con ID ${id} no encontrada.`);
    }

    // Verificar conflictos solo si se están actualizando name o code
    if (updateSubjectDto.name || updateSubjectDto.code) {
      const conflictConditions: Prisma.SubjectWhereInput[] = [];

      if (updateSubjectDto.name) {
        conflictConditions.push({ name: updateSubjectDto.name });
      }
      if (updateSubjectDto.code) {
        conflictConditions.push({ code: updateSubjectDto.code });
      }

      const conflictingSubject = await this.prisma.subject.findFirst({
        where: {
          AND: [
            { id: { not: id } }, // Excluir el registro actual
            { isActive: true }, // Solo verificar activos
            { OR: conflictConditions },
          ],
        },
      });

      if (conflictingSubject) {
        let conflictFields = [];

        if (
          updateSubjectDto.name &&
          conflictingSubject.name === updateSubjectDto.name
        ) {
          conflictFields.push('nombre');
        }
        if (
          updateSubjectDto.code &&
          conflictingSubject.code === updateSubjectDto.code
        ) {
          conflictFields.push('código');
        }

        const fieldsMessage = conflictFields.join(' y ');
        throw new ConflictException(
          `Ya existe otra materia con el mismo ${fieldsMessage}.`,
        );
      }
    }

    return this.prisma.subject.update({
      where: { id },
      data: updateSubjectDto,
    });
  }

  async remove(id: number): Promise<Subject> {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
    });

    if (!subject) {
      throw new NotFoundException(`Materia con ID ${id} no encontrada.`);
    }

    if (!subject.isActive) {
      throw new ConflictException(`La materia con ID ${id} ya está inactiva.`);
    }

    return this.prisma.subject.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
