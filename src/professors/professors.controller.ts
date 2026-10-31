import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NRC, Subject, User } from '@prisma/client';
import { Response } from 'express';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AppUser } from '../auth/jwt.strategy';
import { Public } from '../auth/decorators/public.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { UpdateTeamEvaluationDto } from './dto/update-team-evaluation.dto';
import { GradingReportQueryDto } from './dto/professor-panel-query.dto';
import { GradingReportExportService } from './grading-report-export.service';
import {
  GradingFilterOptionsQueryDto,
  GradingGamesQueryDto,
} from './dto/grading-games-query.dto';
import { GradingGamesService } from './grading-games.service';
import { BatchTeamEvaluationDto } from './dto/batch-team-evaluation.dto';
import { ProfessorsService } from './professors.service';
import { SelectOption } from './types/select-option.type';
import * as EX from './professors.swagger-examples';

@ApiTags('Professors')
@ApiBearerAuth()
@Controller('professors')
export class ProfessorsController {
  constructor(
    private readonly professorsService: ProfessorsService,
    private readonly gradingReportExport: GradingReportExportService,
    private readonly gradingGames: GradingGamesService,
  ) {}

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('CreateProfessor')
  @ApiOperation({ summary: 'Create a new professor' })
  @ApiCreatedResponse({ description: 'Professor created' })
  @ApiBody({
    type: CreateProfessorDto,
    examples: EX.CREATE_PROFESSOR_REQUEST_EXAMPLES,
  })
  @ApiCreatedResponse({
    description: 'Professor created',
    schema: { example: EX.CREATE_PROFESSOR_RESPONSE_EXAMPLE },
  })
  create(@Body() createProfessorDto: CreateProfessorDto) {
    return this.professorsService.create(createProfessorDto);
  }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListProfessors')
  @ApiOperation({ summary: 'List professors (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of professors',
    schema: { example: EX.LIST_PROFESSORS_RESPONSE_EXAMPLE },
  })
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResult<User>> {
    const { includeInactive, limit, page } = query;
    return this.professorsService.findAll(includeInactive, limit, page);
  }

  // NOTE: endpoint `my-nrcs` removed — use `GET /professors/my-subjects` which
  // now returns subjects with their NRCs. The service method `findNrcs` is
  // still available if needed elsewhere.

  /**
   * Get professor's subjects with NRCs
   */
  @Get('my-subjects')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MySubjects')
  @ApiOperation({ summary: "Get professor's subjects with NRCs" })
  @ApiResponse({
    status: 200,
    description: 'List of subjects with NRCs',
    schema: { example: EX.MY_SUBJECTS_RESPONSE_EXAMPLE },
  })
  async findProfessorSubjects(
    @GetUser('id') professorId: string,
  ): Promise<(Subject & { nrcs: NRC[] })[]> {
    // Single endpoint: always include the professor's NRCs
    return this.professorsService.findSubjects(professorId, true) as Promise<
      (Subject & { nrcs: NRC[] })[]
    >;
  }

  @Public()
  @Get('select-options')
  @ApiOperation({ summary: 'Get professor select options (id + name)' })
  @ApiResponse({
    status: 200,
    description: 'Select options',
    schema: { example: EX.SELECT_OPTIONS_RESPONSE_EXAMPLE },
  })
  async findSelectOptions(): Promise<SelectOption[]> {
    return this.professorsService.findForSelect();
  }
  @Get('download-grading-report-grouped')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportToExcel')
  @ApiOperation({
    summary: 'Download grading report with the panel filters (HU-02)',
    description:
      'Exports only what matches the active filters (feria, NRC, search, order), the same teams as GET /professors/grading-games. Without filters, exports everything the professor can see in the active fair; the Administrador exports every active NRC of the active fair.',
  })
  @ApiResponse({
    status: 200,
    description:
      'XLSX file stream. One worksheet per NRC with results, one row per team, in the same order as the panel. File name includes feria and NRC.',
  })
  @ApiResponse({
    status: 404,
    description:
      'No hay datos para exportar, or the NRC does not belong to the professor',
  })
  async downloadGradingReportGrouped(
    @GetUser('id') professorId: string,
    @Res({ passthrough: true }) res: Response,
    @Query() query: GradingReportQueryDto,
    @GetUser('roleId') roleId?: number,
  ) {
    await this.gradingReportExport.exportFiltered(
      professorId,
      query,
      res,
      roleId,
    );
  }

  /**
   * Get signature report grouped by team for a NRC.
   * */
  @Get('nrc-report/by-id/:nrcId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('NrcReport')
  @ApiOperation({ summary: 'Get team-centric report by NRC ID and edition' })
  @ApiParam({ name: 'nrcId', description: 'NRC database ID', type: Number })
  @ApiQuery({
    name: 'editionId',
    required: true,
    description: 'Active edition database ID that owns the NRC',
    type: Number,
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'includeInactive', required: false, example: false })
  @ApiResponse({
    status: 200,
    description: 'Projects associated with this NRC and edition only',
    schema: { example: EX.NRC_REPORT_BY_ID_RESPONSE_EXAMPLE },
  })
  async GetReportByNRCId(
    @Param('nrcId', ParseIntPipe) nrcId: number,
    @Query('editionId', ParseIntPipe) editionId: number,
    @Query() query: PaginationQueryDto,
    @GetUser('id') professorId: string,
  ) {
    const { includeInactive, limit, page } = query;
    return this.professorsService.getNrcReportById(
      nrcId,
      editionId,
      includeInactive,
      limit,
      page,
      professorId,
    );
  }

  @Get('nrc-report/:nrcCode')
  @UseGuards(RolePermissionGuard)
  @RequiredService('NrcReport')
  @ApiOperation({ summary: 'Get team-centric NRC report' })
  @ApiParam({
    name: 'nrcCode',
    description: 'NRC code',
    type: Number,
    example: 2498,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (pagination)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (pagination)',
    example: 20,
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Include inactive teams/members in results',
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Team report for NRC (team-centric, paginated)',
    schema: { example: EX.NRC_REPORT_BY_CODE_RESPONSE_EXAMPLE },
  })
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

  // [MODIFICACIÓN]: Nuevo endpoint para obtener las evaluaciones del profesor como jurado
  // en equipos universitarios (isExternal = false). Se usa en el panel "Calificaciones Uninorte"
  // para mostrar también los equipos universitarios que el profesor evaluó actuando como jurado.
  // [AUTOR]: IA  |  [FECHA]: 27/5/2026
  @Get('juror-evaluations')
  @UseGuards(RolePermissionGuard)
  @RequiredService('NrcReport')
  @ApiOperation({
    summary: 'Get professor juror evaluations for university teams',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (pagination)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (pagination)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Juror evaluations for university teams',
    schema: { example: EX.JUROR_EVALUATIONS_RESPONSE_EXAMPLE },
  })
  async getJurorEvaluations(
    @Query() query: PaginationQueryDto,
    @GetUser('id') professorId: string,
  ) {
    const { limit, page } = query;
    return this.professorsService.getJurorEvaluations(professorId, limit, page);
  }

  /**
   * Get signature report grouped by team for a subject.
   * Each entry contains team details, videogame, and evaluations.
   * Supports pagination and option to include inactive teams/members.
   */
  @Get('signature-report/:subjectName')
  @UseGuards(RolePermissionGuard)
  @RequiredService('SubjectReport')
  @ApiOperation({
    summary: 'Get signature report grouped by team for a subject',
  })
  @ApiParam({
    name: 'subjectName',
    description: 'Subject name',
    example: 'Algoritmia y Programacion I',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (pagination)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page (pagination)',
    example: 20,
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Include inactive teams/members in results',
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Signature report data (team-centric)',
    schema: { example: EX.SIGNATURE_REPORT_RESPONSE_EXAMPLE },
  })
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

  // Endpoint `exportSubject/:subjectName` removed — frontend does not use it.

  /**
   * Create or update (upsert) an evaluation for a team's videogame (inline edit from the frontend).
   * The frontend sends { videogameId, score, isSenior? } and the server uses the authenticated user as the jurorId.
   * Returns 201 Created when a new evaluation is created, or 200 OK when an existing evaluation is updated.
   */
  @Post('team-evaluation')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UploadSeniorGrades')
  @ApiOperation({ summary: 'Inline upsert for team evaluation' })
  @ApiBody({
    type: UpdateTeamEvaluationDto,
    examples: EX.TEAM_EVALUATION_REQUEST_EXAMPLES,
  })
  @ApiResponse({
    status: 201,
    description: 'Evaluation created',
    schema: { example: EX.TEAM_EVALUATION_CREATED_EXAMPLE },
  })
  @ApiResponse({
    status: 200,
    description: 'Evaluation updated',
    schema: { example: EX.TEAM_EVALUATION_UPDATED_EXAMPLE },
  })
  async updateTeamEvaluationInline(
    @Body() dto: UpdateTeamEvaluationDto,
    @GetUser('id') professorId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // professorId is taken from the authenticated user (token) to avoid trusting client-sent jurorId
    // This endpoint now requires `videogameId` (teamId support removed).
    // Enforce server-side that this inline evaluation is always considered a "senior" evaluation.
    const { videogameId, score } = dto;
    const isSeniorForced = true;
    const result = await this.professorsService.updateTeamEvaluation(
      videogameId,
      professorId,
      score,
      isSeniorForced,
    );
    if (result && result.action === 'created') {
      res.status(HttpStatus.CREATED);
    } else {
      res.status(HttpStatus.OK);
    }
    return result;
  }

  @Post('team-evaluation/batch')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UploadSeniorGrades')
  @ApiOperation({ summary: 'Save professor evaluations in batch' })
  @ApiBody({ type: BatchTeamEvaluationDto })
  @ApiResponse({
    status: 200,
    schema: { example: EX.BATCH_TEAM_EVALUATION_RESPONSE_EXAMPLE },
  })
  async updateTeamEvaluationBatch(
    @Body() dto: BatchTeamEvaluationDto,
    @GetUser('id') professorId: string,
  ) {
    return this.professorsService.updateTeamEvaluationBatch(
      professorId,
      dto?.evaluations,
    );
  }

  @Get('grading-games')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MySubjects')
  @ApiOperation({
    summary:
      'List the professor grading panel (same teams as the filtered export)',
    description:
      'Active fair only, active teams, members and NRC; same filters, search and order as download-grading-report-grouped. One row per team. `team` and `student` are deprecated aliases of `search`. includeHistorical=true appends the global read-only historical teams.',
  })
  @ApiResponse({ status: 200, description: 'Paginated games with canEdit authorization flag' })
  @ApiResponse({
    status: 400,
    description: 'Invalid filter (one message per parameter)',
  })
  @ApiResponse({
    status: 404,
    description:
      'The NRC is not an active NRC of the professor in the active fair',
  })
  async getGradingGames(
    @GetUser() user: AppUser,
    @Query() query: GradingGamesQueryDto,
  ) {
    return this.gradingGames.list(user.id, query, user.roleId);
  }

  @Get('grading-games/filter-options')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MySubjects')
  @ApiOperation({ summary: 'Get professor-specific edition and NRC filters for grading games' })
  async getGradingGamesFilterOptions(
    @GetUser() user: AppUser,
    @Query() query: GradingFilterOptionsQueryDto,
  ) {
    return this.professorsService.getGradingFilterOptions(user.id, {
      roleId: user.roleId,
      includeHistorical: query.includeHistorical,
    });
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetProfessor')
  @ApiOperation({ summary: 'Get professor by id' })
  @ApiParam({ name: 'id', description: 'Professor UUID' })
  @ApiResponse({
    status: 200,
    description: 'Professor data',
    schema: { example: EX.PROFESSOR_RESPONSE_EXAMPLE },
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.professorsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateProfessor')
  @ApiOperation({ summary: 'Update a professor' })
  @ApiResponse({
    status: 200,
    description: 'Updated professor',
    schema: { example: EX.UPDATED_PROFESSOR_RESPONSE_EXAMPLE },
  })
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
  @ApiOperation({ summary: 'Delete a professor' })
  @ApiNoContentResponse({ description: 'Professor deactivated' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.professorsService.remove(id);
  }
}
