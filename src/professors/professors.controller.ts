import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ProfessorsService } from './professors.service';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { NRC, Subject, User } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { Public } from '../auth/decorators/public.decorator';
import { SelectOption } from './types/select-option.type';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Response } from 'express';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';

@Controller('professors')
export class ProfessorsController {
  constructor(private readonly professorsService: ProfessorsService) { }

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('CreateProfessor')
  create(@Body() createProfessorDto: CreateProfessorDto) {
    return this.professorsService.create(createProfessorDto);
  }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListProfessors')
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    const { includeInactive, limit, page } = query;
    return this.professorsService.findAll(includeInactive, limit, page);
  }

  @Get('my-nrcs')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetMyNrcs')
  async findProfessorNrcs(
    @Query('includeSubjects') includeSubjects: boolean,
    @GetUser('id') professorId: string,
  ): Promise<NRC[]> {
    return this.professorsService.findNrcs(professorId, includeSubjects);
  }

  @Get('my-subjects')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MySubjects')
  async findProfessorSubjects(
    @Query('includeNrcs') includeNrcs: boolean,
    @GetUser('id') professorId: string,
  ): Promise<Subject[]> {
    return this.professorsService.findSubjects(professorId, includeNrcs);
  }

  @Public()
  @Get('select-options')
  async findSelectOptions(): Promise<SelectOption[]> {
    return this.professorsService.findForSelect();
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetProfessor')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.professorsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateProfessor')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProfessorDto: UpdateProfessorDto,
  ) {
    return this.professorsService.update(id, updateProfessorDto);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteProfessor')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.professorsService.remove(id);
  }

  @Get('nrc-report/:nrcCode')
  @UseGuards(RolePermissionGuard)
  @RequiredService('NrcReport')
  async GetReportByNRC(
    @Param('nrcCode', ParseIntPipe) nrcCode: number,
    @Query() query: PaginationQueryDto,
    @GetUser('id') professorId: string,
  ) {
    const { includeInactive, limit, page } = query;
    return this.professorsService.getNRCreport(
      nrcCode,
      includeInactive,
      limit,
      page,
      professorId,
    );
  }

  @Public()
  @Get('exportNRC/:nrcCode')
  async exportNRCReportToExcel(
    @Param('nrcCode', ParseIntPipe) nrcCode: number,
    @GetUser('id') professorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.professorsService.exportNRCreportToExcel(nrcCode, professorId, res);
  }

  @Get('signature-report/:subjectName')
  @UseGuards(RolePermissionGuard)
  @RequiredService('SubjectReport')
  async getSignatureReport(
    @Param('subjectName') subjectName: string,
    @Query() query: PaginationQueryDto,
    @GetUser('id') professorId: string,
  ) {
    const { includeInactive, limit, page } = query;
    return this.professorsService.GetSignatureReport(
      subjectName,
      includeInactive,
      limit,
      page,
      professorId,
    );
  }

  @Get('exportSubject/:subjectName')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportToExcel')
  async exportSignatureReport(
    @Param('subjectName') subjectName: string,
    @GetUser('id') professorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.professorsService.exportSignatureReportToExcel(subjectName, professorId, res);
  }
}
