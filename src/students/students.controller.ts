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
import { StudentsEvaluations, StudentsGrade, Members } from './types/students.type';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@Controller('students')
export class StudentsController {
    constructor(private readonly studentsService: StudentsService) { }

    @Get()
    findAll(@GetUser('id') id: string, @Query('page') page: number = 1, @Query('limit') limit: number = 10): Promise<PaginatedResult<StudentsEvaluations>> {
        return this.studentsService.getStudentsEvaluations(page, limit, id);
    }

    @Get('/grades')
    findGrades(@GetUser('id') id: string): Promise<StudentsGrade> {
        return this.studentsService.getStudentsGrades(id);
    }

    // @Get('/members')
    // findAllMembers(@GetUser('id') id: string, @Query('page') page: number = 1, @Query('limit') limit: number = 10): Promise<PaginatedResult<Members>> {
    //     return this.studentsService.getMembers(id, page, limit);
    // }

    // @Post('/members/:memberId/nrcs')
    // async editNrc(
    //     @GetUser('id') id: string,
    //     @Param('memberId', ParseIntPipe) memberId: number,
    //     @Body('nrcCodeEdit', ParseIntPipe) nrcCodeEdit: number,
    //     @Body('nrcCodeNew', ParseIntPipe) nrcCodeNew: number
    // ): Promise<boolean> {
    //     return this.studentsService.editNrc(id, memberId, nrcCodeEdit, nrcCodeNew);
    // }

}
