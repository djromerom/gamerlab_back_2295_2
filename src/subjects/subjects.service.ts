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

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) { }

  async create(createSubjectDto: CreateSubjectDto): Promise<Subject> {
    return this.prisma.subject.create({
      data: createSubjectDto,
    });
  }

  async findAll(
    includeInactive: boolean,
    limit: number,
    page: number): Promise<PaginatedResult<Subject>> {

    const offset = (page - 1) * limit;

    const whereClause: Prisma.SubjectWhereInput = {}

    if (!includeInactive)
      whereClause.isActive = true;

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' }
      }),
      this.prisma.subject.count({
        where: whereClause
      })
    ]
    );

    const totalPages = Math.ceil(totalItems / limit);

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
    const existingSubject = await this.prisma.subject.findUnique({
      where: { id },
    });
    if (!existingSubject) {
      throw new NotFoundException(`Subject with ID ${id} not found.`);
    }
    try {
      return await this.prisma.subject.update({
        where: { id: id },
        data: updateSubjectDto,
      });
    } catch (error) {
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
