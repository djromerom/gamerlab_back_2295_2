// src/subjects/subjects.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  NotFoundException,
  HttpCode,
  HttpStatus,
  ConflictException, // Import if using ConflictException from service
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Subject } from '@prisma/client';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  async create(@Body() createSubjectDto: CreateSubjectDto): Promise<Subject> {
    return this.subjectsService.create(createSubjectDto);
  }

  @Get()
  async findAll(): Promise<Subject[]> {
    // This now correctly returns only active subjects due to service change
    return this.subjectsService.findAll();
  }

  // Optional: Endpoint to get all subjects including inactive ones?
  // @Get('all') // Example route
  // async findAllIncludingInactive(): Promise<Subject[]> {
  //   return this.subjectsService.findAllIncludingInactive(); // Assumes you added this method to service
  // }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Subject> {
    // This will find a subject even if it's inactive by default service logic
    return this.subjectsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSubjectDto: UpdateSubjectDto,
  ): Promise<Subject> {
    return this.subjectsService.update(id, updateSubjectDto);
  }

  // --- Controller Delete Endpoint ---
  // Stays largely the same, relies on the service's updated logic.
  // Still returns 204 No Content, which is appropriate for soft delete.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.subjectsService.remove(id); // Service now performs soft delete
    // No body returned for 204
  }
}
