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
    // Check for existing subject with the same name or code
    const existingSubjectByNameOrCode = await this.prisma.subject.findFirst({
      where: {
        OR: [{ name: createSubjectDto.name }, { code: createSubjectDto.code }],
      },
    });

    if (existingSubjectByNameOrCode) {
      let conflictField = '';
      if (existingSubjectByNameOrCode.name === createSubjectDto.name) {
        conflictField = 'name';
      }
      if (existingSubjectByNameOrCode.code === createSubjectDto.code) {
        conflictField = conflictField ? 'name and code' : 'code';
      }
      throw new ConflictException(
        `A subject with this ${conflictField} already exists.`,
      );
    }

    return this.prisma.subject.create({
      data: createSubjectDto,
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
      where: { id: id },
    });
    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found.`);
    }
    return subject;
  }

  async update(
    id: number,
    updateSubjectDto: UpdateSubjectDto,
  ): Promise<Subject> {
    const existingSubjectToUpdate = await this.prisma.subject.findUnique({
      where: { id },
    });

    if (!existingSubjectToUpdate) {
      throw new NotFoundException(`Subject with ID ${id} not found.`);
    }

    // Check if the new name or code conflicts with another existing subject
    if (updateSubjectDto.name || updateSubjectDto.code) {
      const conflictWhereClauses: Prisma.SubjectWhereInput[] = [];

      if (updateSubjectDto.name) {
        conflictWhereClauses.push({ name: updateSubjectDto.name });
      }
      if (updateSubjectDto.code) {
        conflictWhereClauses.push({ code: updateSubjectDto.code });
      }

      const conflictingSubject = await this.prisma.subject.findFirst({
        where: {
          AND: [
            { id: { not: id } }, // Exclude the current subject being updated
            { OR: conflictWhereClauses },
          ],
        },
      });

      if (conflictingSubject) {
        let conflictField = '';
        if (
          updateSubjectDto.name &&
          conflictingSubject.name === updateSubjectDto.name
        ) {
          conflictField = 'name';
        }
        if (
          updateSubjectDto.code &&
          conflictingSubject.code === updateSubjectDto.code
        ) {
          conflictField = conflictField ? 'name and code' : 'code';
        }
        throw new ConflictException(
          `Another subject with this ${conflictField} already exists.`,
        );
      }
    }

    try {
      return await this.prisma.subject.update({
        where: { id: id },
        data: updateSubjectDto,
      });
    } catch (error) {
      // You might want to specifically handle Prisma P2002 errors here too,
      // though the above checks should prevent them for name/code.
      // This catch block is more for other potential update errors.
      throw error;
    }
  }

  async remove(id: number): Promise<Subject> {
    const subject = await this.prisma.subject.findUnique({
      where: { id: id },
    });
    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found.`);
    }
    if (!subject.isActive) {
      throw new ConflictException(`Subject with ID ${id} is already inactive.`);
    }
    const updatedSubject = await this.prisma.subject.update({
      where: { id: id },
      data: { isActive: false },
    });
    return updatedSubject;
  }
}
