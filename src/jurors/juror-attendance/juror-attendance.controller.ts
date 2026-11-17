import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { AnnulJurorArrivalDto } from './dto/annul-juror-arrival.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';
import { JurorArrivalAnnulmentService } from './juror-arrival-annulment.service';
import { JurorAttendanceService } from './juror-attendance.service';

const attendanceExample = {
  edition: { id: 5, title: 'ARKAD 2026-30' },
  totals: { present: 42, missing: 71, total: 113 },
  data: [
    {
      jurorId: '7a1c2b3d-4e5f-4a6b-8c9d-0e1f2a3b4c02',
      attendanceId: null,
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
      attendanceId: 31,
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

const annulledExample = {
  attendanceId: 31,
  edition: { id: 5, title: 'ARKAD 2026-30' },
  juror: { id: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01', name: 'Ana Pérez' },
  checkedInAt: '2026-11-26T13:05:12.000Z',
  method: 'QR',
  checkedInBy: {
    id: '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c03',
    name: 'Staff Mesa 1',
  },
  annulledAt: '2026-11-26T13:20:40.000Z',
  annulledBy: {
    id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c04',
    name: 'Admin Arkad',
  },
  annulmentReason: 'El escáner leyó el QR del jurado de al lado',
  jurorStatus: 'MISSING',
};

const attendanceIdPipe = new ParseIntPipe({
  exceptionFactory: () =>
    new BadRequestException('attendanceId debe ser un número entero'),
});

@ApiTags('Juror attendance')
@Controller('juror-attendance')
@UseGuards(RolePermissionGuard)
@RequiredService('ViewJurorAttendance')
export class JurorAttendanceController {
  constructor(
    private readonly attendanceService: JurorAttendanceService,
    private readonly annulmentService: JurorArrivalAnnulmentService,
  ) {}

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

  @Patch(':attendanceId/annul')
  // Solo Administrador: el Staff ve la asistencia (ViewJurorAttendance) pero no puede anular.
  @RequiredService('AnnulJurorArrival')
  @ApiOperation({
    summary: 'Anula una llegada registrada por error (BG-49)',
    description:
      'Solo el Administrador. La llegada queda en la base como anulada (borrado lógico) con quién la anuló, cuándo y el motivo. El jurado vuelve a «Sin check-in» (`MISSING`) en la asistencia, la alerta de inasistencia y la presencia, y se puede registrar su llegada otra vez. Solo llegadas de la edición activa. `attendanceId` sale de `GET /juror-attendance`.',
  })
  @ApiParam({ name: 'attendanceId', example: 31 })
  @ApiBody({ type: AnnulJurorArrivalDto, required: false })
  @ApiResponse({ status: 200, schema: { example: annulledExample } })
  @ApiResponse({
    status: 400,
    description:
      'Id o motivo no válidos, o la llegada es de una edición que no es la activa (`code: EDITION_READ_ONLY`)',
  })
  @ApiResponse({ status: 403, description: 'Sin permiso (por ejemplo, Staff)' })
  @ApiResponse({
    status: 404,
    description: 'No existe la llegada (`code: ATTENDANCE_NOT_FOUND`)',
  })
  @ApiResponse({
    status: 409,
    description:
      'La llegada ya estaba anulada (`code: ARRIVAL_ALREADY_ANNULLED`)',
  })
  annul(
    @Param('attendanceId', attendanceIdPipe) attendanceId: number,
    @Body() dto: AnnulJurorArrivalDto,
    @GetUser('id') adminId: string,
  ) {
    return this.annulmentService.annul(attendanceId, adminId, dto?.reason);
  }
}
