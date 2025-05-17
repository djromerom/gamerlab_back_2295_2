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
  Res
} from '@nestjs/common';
import { ProfessorsService } from './professors.service';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { ReportNrcDto } from './dto/report-nrc.dto';
import { ReportSubjectDto } from './dto/report-subject.dto';
import { User } from "@prisma/client";
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { Public } from 'src/auth/decorators/public.decorator';
import { SelectOption } from './types/select-option.type';
import { Response } from 'express';

@Controller('professors')
export class ProfessorsController {
  constructor(private readonly professorsService: ProfessorsService) { }

  @Post()
  create(@Body() createProfessorDto: CreateProfessorDto) {
    return this.professorsService.create(createProfessorDto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    const { includeInactive, limit, page } = query;
    return this.professorsService.findAll(includeInactive, limit, page);
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
    @Query() query: Omit<ReportNrcDto, 'nrcCode'>
  ) {
    const { includeInactive, limit, page } = query;
    return this.professorsService.getNRCreport(nrcCode, false, 10, 1);
  }

  @Get('nrc-report/:nrcCode/export')
  async exportNRCReportToExcel(
    @Param('nrcCode') nrcCode: number,
    @Query('includeInactive') includeInactive = false,
    @Query('limit') limit = 10000,
    @Query('page') page = 1,
    @Res() res: Response,
  ) {
    await this.professorsService.exportNRCreportToExcel(+nrcCode, false, +limit, +page, res);
  }

  @Get('signature-report/:subjectName')
  async getSignatureReport(
    @Param('subjectName') subjectName: string,
    @Query() query: Omit<ReportSubjectDto, 'subjectName'>
  ) {
    const { includeInactive, limit, page } = query;
    return this.professorsService.GetSignatureReport(subjectName, includeInactive, limit, page);
  }

  @Get('signature-report/:subjectName/export')
  async exportSignatureReport(
    @Param('subjectName') subjectName: string,
    @Query('includeInactive') includeInactive = false,
    @Query('limit') limit = 10000,
    @Query('page') page = 1,
    @Res() res: Response,
  ) {
    await this.professorsService.exportSignatureReportToExcel(
      subjectName,
      false,
      +limit,
      +page,
      res,
    );
  }
}
