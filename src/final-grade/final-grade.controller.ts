import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AppUser } from '../auth/jwt.strategy';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { UpdateFinalGradeReleaseDto } from './dto/update-final-grade-release.dto';
import {
  FinalGradeReleaseStatus,
  FinalGradeService,
  StudentFinalGrade,
} from './final-grade.service';

const RELEASE_STATUS_EXAMPLE = {
  editionId: 5,
  editionTitle: 'Feria Gamer 2026-2',
  showFinalGrade: false,
  releasedAt: null,
  fairDate: '2026-11-26',
  releaseTime: '12:00',
  timeZone: 'America/Bogota',
  scheduleConfigured: true,
  releaseAllowedFrom: '2026-11-26T17:00:00.000Z',
  canReleaseNow: false,
  summary: {
    totalTeams: 40,
    withFinalGrade: 37,
    inProcess: 3,
    lessThanMinEvaluations: 5,
  },
  incompleteTeams: [
    {
      teamId: 301,
      teamCode: 'N2-ISI-014',
      teamName: 'Pixel',
      videogameName: 'Stella',
      finalScore: 4.1,
      juniorEvaluations: 2,
      seniorEvaluations: 0,
      inProcess: false,
      reasons: ['MISSING_PROFESSOR_SCORE', 'LESS_THAN_MIN_EVALUATIONS'],
    },
  ],
};

/**
 * HU-20 (ARK-80): nota final para los estudiantes.
 * - El administrador ve el resumen (equipos incompletos) y libera u oculta la nota.
 * - El estudiante ve solo la nota final de su equipo, cuando está liberada.
 */
@ApiTags('Final grade')
@Controller('final-grade')
export class FinalGradeController {
  constructor(private readonly finalGradeService: FinalGradeService) {}

  @Get('release')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({
    summary:
      'Estado de la liberación de la nota final y equipos con datos incompletos (solo Administrador)',
    description:
      'Edición activa. `incompleteTeams` lista los equipos sin nota de los jurados junior (`inProcess: true`, el estudiante verá «Nota en proceso»), los que no tienen nota del profesor (solo aviso: su nota es la de jurados al 100 %; en un colegio N0 sí queda en proceso) y los que tienen menos de 3 evaluaciones de jurados (solo aviso).',
  })
  @ApiOkResponse({ schema: { example: RELEASE_STATUS_EXAMPLE } })
  @ApiResponse({
    status: 404,
    description:
      'Sin edición activa (NO_ACTIVE_EDITION) o sin configuración (EVENT_CONFIGURATION_NOT_FOUND)',
  })
  getReleaseStatus(): Promise<FinalGradeReleaseStatus> {
    return this.finalGradeService.getReleaseStatus();
  }

  @Patch('release')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({
    summary:
      'Liberar u ocultar la nota final a los estudiantes (solo Administrador)',
    description:
      'Liberar solo se puede desde la hora de cierre del día de la feria (hora de Colombia): la del cronograma de la edición (HU-12) o, si no está configurado, las 12:00 del día en que inicia la edición. Ocultar se puede siempre y también oculta el ranking público (BG-67). Responde el mismo estado que GET /final-grade/release.',
  })
  @ApiBody({ type: UpdateFinalGradeReleaseDto })
  @ApiOkResponse({
    schema: {
      example: {
        ...RELEASE_STATUS_EXAMPLE,
        showFinalGrade: true,
        releasedAt: '2026-11-26T17:05:00.000Z',
        canReleaseNow: true,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Antes de la hora de cierre (code FINAL_GRADE_RELEASE_TOO_EARLY, con releaseAllowedFrom)',
  })
  setRelease(
    @Body() dto: UpdateFinalGradeReleaseDto,
  ): Promise<FinalGradeReleaseStatus> {
    return this.finalGradeService.setRelease(dto.show);
  }

  @Get('me')
  @UseGuards(RolePermissionGuard)
  @RequiredService('MyGeneralGrade')
  @ApiOperation({
    summary: 'Nota final del equipo del estudiante (sin desglose)',
    description:
      '`status`: NOT_GRADABLE (HU-39: el equipo es un presentador externo y no se califica), REJECTED (BG-43: la inscripción del equipo está rechazada; si la confirman de nuevo, la nota vuelve), NOT_RELEASED (el administrador no la ha liberado), IN_PROCESS (falta la nota de los jurados, o la del profesor en un colegio N0: mostrar «Nota en proceso») o AVAILABLE (`finalGrade` con 2 decimales).',
  })
  @ApiOkResponse({
    schema: {
      example: {
        editionId: 5,
        team: { id: 301, teamName: 'Pixel', teamCode: 'N2-ISI-014' },
        released: true,
        status: 'AVAILABLE',
        finalGrade: 4.12,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'El usuario no tiene equipo en la edición activa',
  })
  getMyFinalGrade(@GetUser() user: AppUser): Promise<StudentFinalGrade> {
    // El líder o un integrante activo del equipo (solo lectura)
    return this.finalGradeService.getStudentFinalGrade(user.id, user.email);
  }
}
