import {
  Controller,
  Get,
  Body,
  Query,
  Param,
  Patch,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { Member } from '@prisma/client';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { StudentsEvaluations, StudentsGrade } from './types/students.type';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { EditNrcDto } from './dto/editNrc.dto';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) { }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('MyEvaluations')
  findAll(
    @GetUser('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<PaginatedResult<StudentsEvaluations>> {
    return this.studentsService.getStudentsEvaluations(page, limit, id);
  }

  @Get('/grades')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MyGeneralGrade')
  findGrades(@GetUser('id') id: string): Promise<StudentsGrade> {
    return this.studentsService.getStudentsGrades(id);
  }

  @Get('/members')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MyTeamMembers')
  findAllMembers(@GetUser('id') id: string): Promise<Member[]> {
    return this.studentsService.getMembers(id);
  }

  @Patch('/members/:memberId/nrcs')
  @UseGuards(RolePermissionGuard)
  @RequiredService('EditMemberNrc')
  async editNrc(
    @GetUser('id') id: string,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() body: EditNrcDto,
  ): Promise<Member> {
    return this.studentsService.editNrc(id, memberId, body.nrcCodes);
  }

}
