// src/subjects/subjects.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException, // Optional: For specific error if already inactive
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Adjust path if needed
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Subject } from '@prisma/client';

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) {} // Inject PrismaService

  async create(createSubjectDto: CreateSubjectDto): Promise<Subject> {
    // Consider adding checks for duplicate code/name if needed
    return this.prisma.subject.create({
      data: createSubjectDto,
    });
  }

  async findAll(): Promise<Subject[]> {
    // --- MODIFICATION: Only return active subjects by default ---
    return this.prisma.subject.findMany({
      where: {
        isActive: true, // Filter by active status
      },
      orderBy: {
        // Optional: Add default ordering
        name: 'asc',
      },
    });
  }

  // Optional: Method to find all subjects including inactive ones (for admin purposes?)
  // async findAllIncludingInactive(): Promise<Subject[]> {
  //   return this.prisma.subject.findMany({
  //     orderBy: { name: 'asc' }
  //   });
  // }

  async findOne(id: number): Promise<Subject> {
    const subject = await this.prisma.subject.findUnique({
      where: { id: id },
      // We might still want to find an inactive subject by its specific ID
      // If you ONLY want to find active subjects by ID, add: active: true
      // where: { id: id, active: true },
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
    // Check if subject exists first
    const existingSubject = await this.prisma.subject.findUnique({
      where: { id },
    });
    if (!existingSubject) {
      throw new NotFoundException(`Subject with ID ${id} not found.`);
    }

    // Optional: Prevent updating certain fields of an inactive subject unless reactivating?
    // if (!existingSubject.active && updateSubjectDto.active !== true) {
    //   throw new ConflictException('Cannot update an inactive subject unless reactivating it.');
    // }

    try {
      return await this.prisma.subject.update({
        where: { id: id },
        data: updateSubjectDto,
      });
    } catch (error) {
      // Handle potential errors like unique constraint violations if code is updated
      // (Prisma throws specific errors, check Prisma docs for error codes)
      throw error; // Re-throw for global exception filter
    }
  }

  // --- METHOD TO MODIFY: Implement Soft Delete ---
  async remove(id: number): Promise<Subject> {
    // Changed return type for confirmation
    // 1. Find the subject first to ensure it exists and check current status
    const subject = await this.prisma.subject.findUnique({
      where: { id: id },
    });

    // 2. If not found, throw error
    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found.`);
    }

    // 3. Optional: If already inactive, you might want to prevent re-deleting
    //    or just return the current state idempotently.
    if (!subject.isActive) {
      // Option A: Throw an error
      throw new ConflictException(`Subject with ID ${id} is already inactive.`);
      // Option B: Return the subject as is (idempotent)
      // return subject;
    }

    // 4. Perform the update to set active = false
    const updatedSubject = await this.prisma.subject.update({
      where: { id: id },
      data: { isActive: false }, // Set active to false
    });

    // 5. Return the updated (now inactive) subject
    return updatedSubject;
  }
  // --- End Soft Delete Implementation ---
}
