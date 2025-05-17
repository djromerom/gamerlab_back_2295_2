import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Patch,
  Delete,
  ParseIntPipe,
  ParseBoolPipe,
  DefaultValuePipe
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { Prisma, Member } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { StudentsEvaluations, StudentsGrade } from './types/students.type';

@Controller('students')
export class StudentsController {
    constructor(private readonly studentsService: StudentsService) {}
    
    @Public()
    @Get(':id')
    findAll(@Param('id', ParseIntPipe) id: number, @Query('page') page : number = 1, @Query('limit') limit: number = 10): Promise<PaginatedResult<StudentsEvaluations>> {
        return this.studentsService.getStudentsEvaluations(page, limit, id);
    }

    @Public()
    @Get('grades/:id')
    findGrades(@Param('id', ParseIntPipe) id: number): Promise<StudentsGrade[]> {
        return this.studentsService.getStudentsGrades(id);
    }
    
}