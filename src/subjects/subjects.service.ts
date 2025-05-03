// src/subjects/subjects.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Subject } from '@prisma/client';

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) {}

  async create(createSubjectDto: CreateSubjectDto): Promise<Subject> {
    return this.prisma.subject.create({
      data: createSubjectDto,
    });
  }

  async findAll(): Promise<Subject[]> {
    return this.prisma.subject.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
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
