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
} from '@nestjs/common';
import { ProfessorsService } from './professors.service';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { NRC, Subject, User } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { Public } from 'src/auth/decorators/public.decorator';
import { SelectOption } from './types/select-option.type';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Response } from 'express';

@Controller('professors')
export class ProfessorsController {
  constructor(private readonly professorsService: ProfessorsService) {}

  @Post()
  create(@Body() createProfessorDto: CreateProfessorDto) {
    return this.professorsService.create(createProfessorDto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    const { includeInactive, limit, page } = query;
    return this.professorsService.findAll(includeInactive, limit, page);
  }

  @Get('my-nrcs')
  async findProfessorNrcs(
    @Query('includeSubjects') includeSubjects: boolean,
    @GetUser('id') professorId: string,
  ): Promise<NRC[]> {
    return this.professorsService.findNrcs(professorId, includeSubjects);
  }

  @Get('my-subjects')
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
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.professorsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProfessorDto: UpdateProfessorDto,
  ) {
    return this.professorsService.update(id, updateProfessorDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.professorsService.remove(id);
  }

  @Get('nrc-report/:nrcCode')
  async GetReportByNRC(
    @Param('nrcCode') nrcCode: number,
    @Query() query: PaginationQueryDto,
  ) {
    const { includeInactive, limit, page } = query;
    return this.professorsService.getNRCreport(
      nrcCode,
      includeInactive,
      limit,
      page,
    );
  }

  @Public()
  @Get('exportNRC/:nrcCode')
  async exportNRCReportToExcel(
    @Param('nrcCode') nrcCode: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.professorsService.exportNRCreportToExcel(nrcCode, res);
  }

  @Get('signature-report/:subjectName')
  async getSignatureReport(
    @Param('subjectName') subjectName: string,
    @Query() query: PaginationQueryDto,
  ) {
    const { includeInactive, limit, page } = query;
    return this.professorsService.GetSignatureReport(
      subjectName,
      includeInactive,
      limit,
      page,
    );
  }

  @Get('exportSubject/:subjectName')
  async exportSignatureReport(
    @Param('subjectName') subjectName: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.professorsService.exportSignatureReportToExcel(subjectName, res);
  }
}
