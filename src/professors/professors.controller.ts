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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';

@ApiTags('Professors')
@ApiBearerAuth()
@Controller('professors')
export class ProfessorsController {
  constructor(private readonly professorsService: ProfessorsService) { }

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
        value: { firstName: 'John', lastName: 'Doe', email: 'john.doe@uninorte.edu.co' },
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
    schema: {
      example: {
        data: [
          { id: 'uuid-1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', roleId: 3, isActive: true }
        ],
        metadata: { totalItems: 1, itemsOnCurrentPage: 1, currentPage: 1, itemsPerPage: 25, totalPages: 1 }
      }
    }
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
    schema: {
      example: [
        {
          id: 1,
          name: 'Algoritmia y Programación I',
          code: 'IST1234',
          semester: 1,
          nrcs: [
            { id: 1, code: 2496, isActive: true },
            { id: 2, code: 2498, isActive: true }
          ]
        },
        {
          id: 2,
          name: 'Estructura de Datos I',
          code: 'IST2050',
          semester: 3,
          nrcs: [
            { id: 3, code: 5025, isActive: true }
          ]
        }
      ]
    }
  })
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
  @ApiOperation({ summary: 'Get professor select options (id + name)' })
  @ApiResponse({ status: 200, description: 'Select options', schema: { example: [{ id: 'uuid-1', label: 'John Doe' }] } })
  async findSelectOptions(): Promise<SelectOption[]> {
    return this.professorsService.findForSelect();
  }
  /**
   * Download grading template for all subjects/NRCs.
   * Generates an XLSX workbook with one sheet per subject/NRC containing only teams that have members. 
   * Use query parameter `?final=true` to include the "Calificación Feria" column (final export). 
   * The template is intended to be filled and re-uploaded using the upload endpoint which will parse and persist senior grades.
   */
  @Get('download-grading-template-all')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportToExcel')
  @ApiOperation({ summary: 'Download grading template for all subjects/NRCs' })
  @ApiQuery({ name: 'final', required: false, description: 'Set to true to include column: Calificación Feria', example: 'true' })
  @ApiResponse({
    status: 200,
    description:
      'XLSX file stream. The generated workbook contains one sheet per subject/NRC (only teams with members). Columns include: NRC, Subject, Student(s), Team, Videogame, Calificación Docente (prefilled, non-editable in final export), Calificación Feria (purple header), Grade',
  })
  async downloadGradingTemplateAll(
    @GetUser('id') professorId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('final') finalParam?: string,
  ) {
    // Permitir ?final=true o ?final=1 para activar el modo final
    const final = finalParam === 'true' || finalParam === '1';
    await this.professorsService.downloadGradingTemplateAll(professorId, res, final);
  }

  @Get('download-grading-report-grouped')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ExportToExcel')
  @ApiOperation({ summary: 'Download grouped grading report by NRC and team' })
  @ApiQuery({
    name: 'final',
    required: false,
    description: 'Set to true to include Calificación Feria and Calificación Jurado Junior',
    example: 'true',
  })
  @ApiResponse({
    status: 200,
    description:
      'XLSX file stream. One worksheet per NRC with one row per team and consolidated members.',
  })
  async downloadGradingReportGrouped(
    @GetUser('id') professorId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('final') finalParam?: string,
  ) {
    const final = finalParam === 'true' || finalParam === '1';
    await this.professorsService.downloadGradingReportGrouped(professorId, res, final);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetProfessor')
  @ApiOperation({ summary: 'Get professor by id' })
  @ApiParam({ name: 'id', description: 'Professor UUID' })
  @ApiResponse({ status: 200, description: 'Professor data', schema: { example: { id: 'uuid-1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', roleId: 3, isActive: true } } })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.professorsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateProfessor')
  @ApiOperation({ summary: 'Update a professor' })
  @ApiResponse({ status: 200, description: 'Updated professor', schema: { example: { id: 'uuid-1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', roleId: 3, isActive: true } } })
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
  /**
   * Get signature report grouped by team for a NRC.
   * */
  @Get('nrc-report/:nrcCode')
  @UseGuards(RolePermissionGuard)
  @RequiredService('NrcReport')
  @ApiOperation({ summary: 'Get team-centric NRC report' })
  @ApiParam({ name: 'nrcCode', description: 'NRC code', type: Number, example: 2498 })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (pagination)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (pagination)', example: 20 })
  @ApiQuery({ name: 'includeInactive', required: false, description: 'Include inactive teams/members in results', example: false })
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
            videogameId: 24
          }
        ],
        metadata: {
          totalItems: 1,
          itemsOnCurrentPage: 1,
          currentPage: 1,
          itemsPerPage: 20,
          totalPages: 1
        }
      }
    }
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


  /**
      * Get signature report grouped by team for a subject.
      * Each entry contains team details, videogame, and evaluations.
      * Supports pagination and option to include inactive teams/members.
   */
  @Get('signature-report/:subjectName')
  @UseGuards(RolePermissionGuard)
  @RequiredService('SubjectReport')
  @ApiOperation({ summary: 'Get signature report grouped by team for a subject' })
  @ApiParam({ name: 'subjectName', description: 'Subject name', example: 'Algoritmia y Programacion I' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (pagination)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (pagination)', example: 20 })
  @ApiQuery({ name: 'includeInactive', required: false, description: 'Include inactive teams/members in results', example: false })
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
            videogameId: 25
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
            videogameId: 24
          }
        ],
        metadata: {
          totalItems: 2,
          itemsOnCurrentPage: 2,
          currentPage: 1,
          itemsPerPage: 20,
          totalPages: 1
        }
      }
    }
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
   * Upload an XLSX file containing senior juror grades.
   * The uploaded file is expected to be the grading template previously
   * downloaded from `GET /professors/download-grading-template-all`.
   * Each sheet corresponds to a subject/NRC and rows should contain the
   * videogame identifiers and the professor's grades. The service parses
   * the workbook and upserts senior evaluations accordingly.
   */
  @Post('upload-senior-grades')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UploadSeniorGrades')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload an XLSX with senior juror grades',
    description:
      'Upload the grading template previously downloaded from `GET /professors/download-grading-template-all`. Each sheet represents a subject/NRC and rows must contain the videogame identifier and the professor\'s grade. The server will parse the workbook and upsert senior evaluations accordingly.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Binary XLSX file: grading template downloaded from the server (one sheet per subject/NRC).',
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 200, description: 'Processing results', schema: { example: { processed: 10, created: 8, updated: 2, errors: [] } } })
  async uploadSeniorGrades(
    @UploadedFile() file: Express.Multer.File,
    @GetUser('id') professorId: string,
  ) {
    return this.professorsService.processSeniorGradesExcel(file, professorId);
  }

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
        "action": "created",
        "evaluation": {
          "id": 11,
          "date": "2025-11-14T06:12:40.992Z",
          "comments": null,
          "totalScore": 4.5,
          "jurorId": "f777c17a-3390-4830-bf21-fb92235a679b",
          "videogameId": 27,
          "editionId": 2,
          "isSenior": true,
          "isActive": true
        }
      }
    }
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
          isActive: true
        }
      }
    }
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
    const result = await this.professorsService.updateTeamEvaluation(videogameId, professorId, score, isSeniorForced);
    if (result && result.action === 'created') {
      res.status(HttpStatus.CREATED);
    } else {
      res.status(HttpStatus.OK);
    }
    return result;
  }
}
