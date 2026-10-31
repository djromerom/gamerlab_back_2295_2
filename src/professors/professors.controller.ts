import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { omitPassword } from '../common/utils/omit-password';
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
import { ROLE_IDS } from '../auth/constants/roles';
import { Public } from '../auth/decorators/public.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { CreateProfessorDto } from './dto/create-professor.dto';
import { UpdateProfessorDto } from './dto/update-professor.dto';
import { UpdateTeamEvaluationDto } from './dto/update-team-evaluation.dto';
import { GradingReportQueryDto } from './dto/professor-panel-query.dto';
import { GradingReportExportService } from './grading-report-export.service';
import { BatchTeamEvaluationDto } from './dto/batch-team-evaluation.dto';
import { ProfessorsService } from './professors.service';
import { SelectOption } from './types/select-option.type';

@ApiTags('Professors')
@ApiBearerAuth()
@Controller('professors')
export class ProfessorsController {
  constructor(
    private readonly professorsService: ProfessorsService,
    private readonly gradingReportExport: GradingReportExportService,
  ) {}

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('CreateProfessor')
  @ApiOperation({ summary: 'Create a new professor' })
  @ApiCreatedResponse({ description: 'Professor created' })
  @ApiBody({
    type: CreateProfessorDto,
    examples: {
      default: {
        summary: 'Create professor example',
        value: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@uninorte.edu.co',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Professor created',
    schema: {
      example: {
        id: 'a1b2c3d4-uuid-example',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@uninorte.edu.co',
        roleId: 3,
        isActive: true,
      },
    },
  })
  async create(@Body() createProfessorDto: CreateProfessorDto) {
    return omitPassword(
      await this.professorsService.create(createProfessorDto),
    );
  }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListProfessors')
  @ApiOperation({ summary: 'List professors (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of professors',
    schema: {
      example: {
        data: [
          {
            id: 'uuid-1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            roleId: 3,
            isActive: true,
          },
        ],
        metadata: {
          totalItems: 1,
          itemsOnCurrentPage: 1,
          currentPage: 1,
          itemsPerPage: 25,
          totalPages: 1,
        },
      },
    },
  })
  async findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<Omit<User, 'password'>>> {
    const { includeInactive, limit, page } = query;
    const result = await this.professorsService.findAll(
      includeInactive,
      limit,
      page,
    );
    return { ...result, data: result.data.map((u) => omitPassword(u)) };
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
    schema: {
      example: [
        {
          id: 1,
          name: 'Algoritmia y Programación I',
          code: 'IST1234',
          semester: 1,
          nrcs: [
            { id: 1, code: 2496, isActive: true },
            { id: 2, code: 2498, isActive: true },
          ],
        },
        {
          id: 2,
          name: 'Estructura de Datos I',
          code: 'IST2050',
          semester: 3,
          nrcs: [{ id: 3, code: 5025, isActive: true }],
        },
      ],
    },
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
    schema: { example: [{ id: 'uuid-1', label: 'John Doe' }] },
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
      'Exports only what matches the active filters (feria, NRC, search, order). Without filters, exports everything the professor can see.',
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
  ) {
    await this.gradingReportExport.exportFiltered(professorId, query, res);
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
    schema: {
      example: {
        filter: {
          nrcId: 3,
          nrcCode: 2501,
          editionId: 1,
          year: 2025,
          semester: 10,
        },
        data: [
          {
            teamCode: 'D25N2501-01',
            nrc: '2501',
            team: 'Demo 2025 NRC 2501 - Mision Naturaleza',
            subject: 'Colegios',
            integrantes: 'Isabella Mora',
            videogame: 'Mision Naturaleza',
            calificacionFeria: null,
            calificacionDocente: null,
            videogameId: 1,
            editionId: 1,
            nrcId: 3,
          },
        ],
        metadata: {
          totalItems: 1,
          itemsOnCurrentPage: 1,
          currentPage: 1,
          itemsPerPage: 20,
          totalPages: 1,
        },
      },
    },
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
    schema: {
      example: {
        data: [
          {
            teamCode: 'N1-IST-101',
            nrc: '2498, 2496',
            team: 'Warriors',
            subject: 'Algoritmia y Programación I',
            integrantes: 'Camilo Gómez, Laura Mendoza, Valentina Ramírez',
            videogame: 'Stella',
            calificacionFeria: 4.8,
            calificacionDocente: 4.8,
            videogameId: 24,
          },
        ],
        metadata: {
          totalItems: 1,
          itemsOnCurrentPage: 1,
          currentPage: 1,
          itemsPerPage: 20,
          totalPages: 1,
        },
      },
    },
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
    schema: {
      example: {
        data: [
          {
            teamCode: 'ABC-123',
            nrc: '2496',
            team: 'Warriors',
            subject: 'Algoritmia y Programación I',
            integrantes: 'Camilo Gómez, Laura Mendoza',
            videogame: 'Stella',
            calificacionFeria: 4.5,
            calificacionDocente: null,
            videogameId: 24,
            isExternal: false,
          },
        ],
        metadata: {
          totalItems: 1,
          itemsOnCurrentPage: 1,
          currentPage: 1,
          itemsPerPage: 20,
          totalPages: 1,
        },
      },
    },
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
    schema: {
      example: {
        data: [
          {
            teamCode: 'N1-IST-101',
            nrc: '2498',
            team: 'Nebula',
            subject: 'Algoritmia y Programación I',
            integrantes: 'Natalia Suárez, Julián Castro, Mariana Ortiz',
            videogame: 'Nebula Clash',
            calificacionFeria: 5,
            calificacionDocente: 5,
            videogameId: 25,
          },
          {
            teamCode: 'N1-IST-101',
            nrc: '2496, 2498',
            team: 'Warriors',
            subject: 'Algoritmia y Programación I',
            integrantes: 'Valentina Ramírez, Camilo Gómez, Laura Mendoza',
            videogame: 'Stella',
            calificacionFeria: 4.8,
            calificacionDocente: 4.8,
            videogameId: 24,
          },
        ],
        metadata: {
          totalItems: 2,
          itemsOnCurrentPage: 2,
          currentPage: 1,
          itemsPerPage: 20,
          totalPages: 1,
        },
      },
    },
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
    examples: {
      updateExample: {
        summary: 'Update example',
        value: { videogameId: 24, score: 4.7, isSenior: true },
      },
      upsertExample: {
        summary: 'Upsert (create) example',
        value: { videogameId: 27, score: 4.5, isSenior: true },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Evaluation created',
    schema: {
      example: {
        action: 'created',
        evaluation: {
          id: 11,
          date: '2025-11-14T06:12:40.992Z',
          comments: null,
          totalScore: 4.5,
          jurorId: 'f777c17a-3390-4830-bf21-fb92235a679b',
          videogameId: 27,
          editionId: 2,
          isSenior: true,
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Evaluation updated',
    schema: {
      example: {
        action: 'updated',
        evaluation: {
          id: 1,
          date: '2025-11-08T22:57:51.792Z',
          comments: null,
          totalScore: 4.7,
          jurorId: 'f777c17a-3390-4830-bf21-fb92235a679b',
          videogameId: 24,
          editionId: 2,
          isSenior: true,
          isActive: true,
        },
      },
    },
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
  @ApiResponse({ status: 200, schema: { example: { results: [
    { videogameId: 24, success: true },
    { videogameId: 25, success: false, message: 'Score must be between 0 and 5, with at most two decimal places' },
  ] } } })
  async updateTeamEvaluationBatch(
    @Body() dto: BatchTeamEvaluationDto,
    @GetUser('id') professorId: string,
  ) {
    const results = await Promise.all((Array.isArray(dto?.evaluations) ? dto.evaluations : []).map(async (row) => {
      const videogameId = row?.videogameId;
      try {
        if (!Number.isInteger(videogameId) || videogameId < 1) {
          throw new Error('videogameId must be a positive integer');
        }
        await this.professorsService.updateTeamEvaluation(videogameId, professorId, row?.score, true);
        return { videogameId, success: true as const };
      } catch (error) {
        const message = (error as any)?.response;
        return {
          videogameId,
          success: false as const,
          message: typeof message === 'string' ? message : message?.message ?? (error as any)?.message ?? 'Could not save evaluation',
        };
      }
    }));
    return { results };
  }

  @Get('grading-games')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MySubjects')
  @ApiOperation({ summary: 'List current and historical games for professor grading panel' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  @ApiQuery({ name: 'editionId', required: false, type: Number })
  @ApiQuery({ name: 'nrcId', required: false, type: Number })
  @ApiQuery({ name: 'team', required: false })
  @ApiQuery({ name: 'student', required: false })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['student', 'team'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Paginated games with canEdit authorization flag' })
  async getGradingGames(
    @GetUser('id') professorId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '25',
    @Query('editionId') editionId?: string,
    @Query('nrcId') nrcId?: string,
    @Query('team') team?: string,
    @Query('student') student?: string,
    @Query('sortBy') sortBy?: 'student' | 'team',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.professorsService.getGradingGames(professorId, {
      page: Number(page), limit: Number(limit),
      editionId: editionId === undefined ? undefined : Number(editionId),
      nrcId: nrcId === undefined ? undefined : Number(nrcId), team, student, sortBy, sortOrder,
    });
  }

  @Get('grading-games/filter-options')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MySubjects')
  @ApiOperation({ summary: 'Get professor-specific edition and NRC filters for grading games' })
  async getGradingGamesFilterOptions(@GetUser('id') professorId: string) {
    return this.professorsService.getGradingFilterOptions(professorId);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetProfessor')
  @ApiOperation({ summary: 'Get professor by id' })
  @ApiParam({ name: 'id', description: 'Professor UUID' })
  @ApiResponse({
    status: 200,
    description: 'Professor data',
    schema: {
      example: {
        id: 'uuid-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        roleId: 3,
        isActive: true,
      },
    },
  })
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: AppUser) {
    // ARK-SP1 #12: un Profesor (GetProfessor) solo lee su propio registro
    if (user.roleId === ROLE_IDS.PROFESSOR && user.id !== id) {
      throw new ForbiddenException('Solo puedes consultar tu propio perfil');
    }
    // Sin hash de contraseña en la respuesta (detalles-back). Sin `async` para que el 403 siga
    // lanzándose de forma síncrona antes de consultar el servicio.
    return this.professorsService.findOne(id).then((p) => omitPassword(p));
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateProfessor')
  @ApiOperation({ summary: 'Update a professor' })
  @ApiResponse({
    status: 200,
    description: 'Updated professor',
    schema: {
      example: {
        id: 'uuid-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        roleId: 3,
        isActive: true,
      },
    },
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProfessorDto: UpdateProfessorDto,
  ) {
    return omitPassword(
      await this.professorsService.update(id, updateProfessorDto),
    );
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
