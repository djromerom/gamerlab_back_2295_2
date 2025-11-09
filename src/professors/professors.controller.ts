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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ProfessorsService } from './professors.service';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { UpdateTeamEvaluationDto } from './dto/update-team-evaluation.dto';
import { NRC, Subject, User } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { Public } from '../auth/decorators/public.decorator';
import { SelectOption } from './types/select-option.type';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Response } from 'express';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

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

  // NOTE: endpoint `my-nrcs` removed — use `GET /professors/my-subjects` which
  // now returns subjects with their NRCs. The service method `findNrcs` is
  // still available if needed elsewhere.

  @Get('my-subjects')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MySubjects')
  async findProfessorSubjects(
    @GetUser('id') professorId: string,
  ): Promise<(Subject & { nrcs: NRC[] })[]> {
    // Single endpoint: always include the professor's NRCs
    return this.professorsService.findSubjects(professorId, true) as Promise<(
      Subject & { nrcs: NRC[] }
    )[]>;
  }

  @Public()
  @Get('select-options')
  async findSelectOptions(): Promise<SelectOption[]> {
    return this.professorsService.findForSelect();
  }

  @Get('download-grading-template-all')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportToExcel')
  async downloadGradingTemplateAll(
    @GetUser('id') professorId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('final') finalParam?: string,
  ) {
    // Permitir ?final=true o ?final=1 para activar el modo final
    const final = finalParam === 'true' || finalParam === '1';
    await this.professorsService.downloadGradingTemplateAll(professorId, res, final);
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

  @Post('upload-senior-grades')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UploadSeniorGrades')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSeniorGrades(
    @UploadedFile() file: Express.Multer.File,
    @GetUser('id') professorId: string,
  ) {
    return this.professorsService.processSeniorGradesExcel(file, professorId);
  }

  /**
   * Crea o actualiza (upsert) una evaluación para un equipo (inline edit desde front).
   * El front envía { teamId, score, isSenior? } y el servidor usa el usuario autenticado como jurorId.
   * Devuelve 201 Created si se creó la evaluación, 200 OK si se actualizó.
   */
  @Post('team-evaluation')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UploadSeniorGrades')
  async updateTeamEvaluationInline(
    @Body() dto: UpdateTeamEvaluationDto,
    @GetUser('id') professorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // professorId is taken from the authenticated user (token) to avoid trusting client-sent jurorId
    // Accept either videogameId (preferred) or teamId (legacy). Service will resolve.
    const { teamId, videogameId, score, isSenior } = dto;
    const result = await this.professorsService.updateTeamEvaluation(teamId, professorId, score, isSenior, videogameId);
    if (result && result.action === 'created') {
      res.status(HttpStatus.CREATED);
    } else {
      res.status(HttpStatus.OK);
    }
    return result;
  }
}
