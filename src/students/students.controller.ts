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
import { StudentsEvaluations } from './types/students.type';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AppUser } from 'src/auth/jwt.strategy';
import { EditNrcDto } from './dto/editNrc.dto';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { AdminRoleGuard } from 'src/auth/guards/admin-role.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EditionStudentsService } from './edition-students.service';
import { ListEditionStudentsQueryDto } from './dto/list-edition-students-query.dto';
import { EditionStudentsList } from './types/edition-students.type';
import { FinalGradeService } from '../final-grade/final-grade.service';

@Controller('students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly editionStudentsService: EditionStudentsService,
    private readonly finalGradeService: FinalGradeService,
  ) { }

  // ARK-129 (HU-26): estudiantes de una edición con su equipo y su estado. Solo Administrador.
  @Get('/participation')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListEditionStudents')
  @ApiTags('Students')
  @ApiOperation({
    summary: 'Estudiantes inscritos en una edición (por defecto, la activa) con su equipo y su estado',
  })
  @ApiOkResponse({
    schema: {
      example: {
        edition: { id: 5, title: 'Arkad 2026-2', status: 'ACTIVE', readOnly: false },
        summary: {
          total: 2,
          active: 2,
          inactive: 0,
          byVideogameStatus: { PENDIENTE: 1, CONFIRMADO: 1, RECHAZADO: 0 },
        },
        data: [
          {
            memberId: 812,
            firstName: 'Ana',
            lastName: 'Pérez',
            email: 'aperez@uninorte.edu.co',
            studentCode: '200123456',
            isActive: true,
            isLeader: true,
            team: { id: 301, teamName: 'Pixel', teamCode: 'N2-ISI-014', isActive: true },
            videogameStatus: 'CONFIRMADO',
            accountStatus: 'CONFIRMADO',
          },
        ],
        metadata: { totalItems: 2, itemsOnCurrentPage: 2, currentPage: 1, itemsPerPage: 20, totalPages: 1 },
      },
    },
  })
  listEditionStudents(@Query() query: ListEditionStudentsQueryDto): Promise<EditionStudentsList> {
    return this.editionStudentsService.list(query);
  }

  // ARK-154 (HU-30): el estudiante ve solo la nota final de su grupo, no cada evaluación
  // (puntaje, comentario y criterios). Antes era `MyEvaluations` (solo Estudiante): ahora el
  // estudiante recibe 403 y queda solo para el Administrador.
  @Get()
  @UseGuards(AdminRoleGuard)
  @ApiOperation({
    summary: 'Evaluaciones individuales del equipo (solo Administrador)',
    description:
      'ARK-154 (HU-30): el estudiante recibe 403. Su nota es solo la final: GET /final-grade/me.',
  })
  findAll(
    @GetUser('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<PaginatedResult<StudentsEvaluations>> {
    return this.studentsService.getStudentsEvaluations(page, limit, id);
  }

  @Get('/my-judges')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MyEvaluations')
  @ApiOperation({
    summary: 'Jurados asignados al equipo del estudiante',
    description:
      'ARK-154 (HU-30): nombre, categoría y si ya evaluó (`haEvaluado`); sin la nota de cada jurado.',
  })
  getMyJudges(@GetUser('id') id: string) {
    return this.studentsService.getMyJudges(id);
  }

  // HU-20 (ARK-80): la nota final (HU-34) solo cuando el administrador la libera; antes se veía
  // en cualquier momento.
  @Get('/grades')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MyGeneralGrade')
  @ApiOperation({
    summary:
      'Nota final del equipo del estudiante, o null si no está liberada o está en proceso',
    description:
      'HU-20 (ARK-80): se conserva por compatibilidad. Usar GET /final-grade/me, que dice el motivo.',
    deprecated: true,
  })
  async findGrades(
    @GetUser('id') id: string,
  ): Promise<{ grade: number | null }> {
    const { finalGrade } =
      await this.finalGradeService.getStudentFinalGrade(id);
    return { grade: finalGrade };
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
    @GetUser() user: AppUser,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() body: EditNrcDto,
  ): Promise<Member> {
    return this.studentsService.editNrc(user, memberId, body.nrcCodes);
  }
}
