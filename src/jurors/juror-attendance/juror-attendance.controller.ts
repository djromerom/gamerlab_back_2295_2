import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { JurorAttendanceService } from './juror-attendance.service';

const attendanceExample = {
  edition: { id: 5, title: 'ARKAD 2026-30' },
  totals: { present: 42, missing: 71, total: 113 },
  data: [
    {
      jurorId: '7a1c2b3d-4e5f-4a6b-8c9d-0e1f2a3b4c02',
      name: 'Luis Gómez',
      category: 'Junior',
      isProfessor: false,
      hasBadge: false,
      status: 'MISSING',
      checkedInAt: null,
      method: null,
      checkedInBy: null,
    },
    {
      jurorId: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01',
      name: 'Ana Pérez',
      category: 'Senior',
      isProfessor: true,
      hasBadge: true,
      status: 'PRESENT',
      checkedInAt: '2026-11-26T13:05:12.000Z',
      method: 'QR',
      checkedInBy: {
        id: '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c03',
        name: 'Staff Mesa 1',
      },
    },
  ],
  metadata: {
    totalItems: 113,
    itemsOnCurrentPage: 50,
    currentPage: 1,
    itemsPerPage: 50,
    totalPages: 3,
  },
};

@ApiTags('Juror attendance')
@Controller('juror-attendance')
@UseGuards(RolePermissionGuard)
@RequiredService('ViewJurorAttendance')
export class JurorAttendanceController {
  constructor(private readonly attendanceService: JurorAttendanceService) {}

  @Get()
  @ApiOperation({
    summary: 'Asistencia de los jurados de la edición activa (HU-29)',
    description:
      'Todos los jurados de la edición activa (externos confirmados y profesores de la edición) con su estado: `PRESENT` (hora, método y quién registró la llegada) o `MISSING`. Primero los que faltan, por apellido; luego los presentes, el último en llegar arriba. `totals` respeta la búsqueda pero no el filtro de estado. Solo lectura y sin correos.',
  })
  @ApiResponse({ status: 200, schema: { example: attendanceExample } })
  @ApiResponse({ status: 400, description: 'Filtros no válidos' })
  @ApiResponse({ status: 403, description: 'Sin permiso' })
  @ApiResponse({
    status: 404,
    description: 'No hay una edición activa (`code: NO_ACTIVE_EDITION`)',
  })
  list(@Query() query: ListAttendanceQueryDto) {
    return this.attendanceService.list(query);
  }
}
