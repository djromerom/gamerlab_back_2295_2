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
  ConflictException,
  UseGuards, // Import if using ConflictException from service
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { Subject } from '@prisma/client';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('Create Subject')
  async create(@Body() createSubjectDto: CreateSubjectDto): Promise<Subject> {
    return this.subjectsService.create(createSubjectDto);
  }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('List Subjects')
  async findAll(): Promise<Subject[]> {
    return this.subjectsService.findAll();
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('Get Subject By ID')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Subject> {
    return this.subjectsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('Update Subject (PATCH)')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSubjectDto: UpdateSubjectDto,
  ): Promise<Subject> {
    return this.subjectsService.update(id, updateSubjectDto);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('Delete Subject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.subjectsService.remove(id);
  }
}
