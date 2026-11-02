import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { EditionIdDto } from './dto/edition-id.dto';
import { EnrollJurorDto } from './dto/enroll-juror.dto';
import { ListEditionJurorsQueryDto } from './dto/list-edition-jurors-query.dto';
import { UpdateJurorEditionStatusDto } from './dto/update-juror-edition-status.dto';
import { JurorEditionService } from './juror-edition.service';

const enrolledExample = {
  jurorId: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01',
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana.perez@empresa.com',
  category: 'Junior',
  type: 'OFFICIAL',
  status: 'PENDING',
  source: 'ENROLLED',
  updatedAt: '2026-11-03T15:20:00.000Z',
};

/** HU-25: qué jurados participan en cada edición. Solo Administrador. */
@ApiTags('Juror edition')
@Controller('juror-edition')
@UseGuards(RolePermissionGuard)
export class JurorEditionController {
  constructor(private readonly service: JurorEditionService) {}

  @Get()
  @RequiredService('ListEditionJurors')
  @ApiOperation({
    summary: 'Lista los jurados de una edición con su estado',
    description:
      'Jurados inscritos (Pendiente, Confirmado, Declinó) y profesores con NRC activo (AUTOMATIC). Por defecto la edición activa.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [enrolledExample],
        metadata: {
          totalItems: 1,
          itemsOnCurrentPage: 1,
          currentPage: 1,
          itemsPerPage: 20,
          totalPages: 1,
        },
        edition: { id: 5, title: 'Feria Gamer 2026-30', status: 'ACTIVE' },
        counts: { PENDING: 1, CONFIRMED: 0, DECLINED: 0, AUTOMATIC: 0 },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'La edición no existe o no hay edición activa',
  })
  list(@Query() query: ListEditionJurorsQueryDto) {
    return this.service.list(query);
  }

  @Post('import-previous')
  @RequiredService('ManageEditionJurors')
  @ApiOperation({
    summary:
      'Trae como Pendientes a los jurados confirmados de la edición anterior',
    description:
      'No duplica. Si la anterior no tiene lista (antes de HU-25), trae a todos los jurados activos (fallback).',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: { sourceEditionId: 4, created: 37, skipped: 0, fallback: true },
    },
  })
  @ApiResponse({ status: 400, description: 'La edición está archivada' })
  @ApiResponse({ status: 404, description: 'No hay edición anterior o activa' })
  importPrevious(@Body() dto: EditionIdDto, @GetUser('id') actorId: string) {
    return this.service.importPrevious(dto, actorId);
  }

  @Patch('status')
  @HttpCode(HttpStatus.OK)
  @RequiredService('ManageEditionJurors')
  @ApiOperation({
    summary:
      'Confirma, declina o cambia el tipo de varios jurados (resultado por fila)',
    description:
      'Con declineRemaining: true, los Pendientes que no vienen en items pasan a Declinó.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        results: [
          { jurorId: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01', ok: true },
          {
            jurorId: '9a2b0c1d-0000-4000-8000-000000000000',
            ok: false,
            error: 'IS_PROFESSOR',
          },
        ],
        declined: 12,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validación o edición archivada' })
  updateStatus(
    @Body() dto: UpdateJurorEditionStatusDto,
    @GetUser('id') actorId: string,
  ) {
    return this.service.updateStatus(dto, actorId);
  }

  @Post('enroll')
  @RequiredService('ManageEditionJurors')
  @ApiOperation({
    summary: 'Inscribe por correo, ya confirmado, a un jurado con cuenta',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: { ...enrolledExample, type: 'BACKUP', status: 'CONFIRMED' },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'La cuenta no es de rol Jurado o la edición está archivada',
  })
  @ApiResponse({
    status: 404,
    description: 'No hay una cuenta activa con ese correo',
  })
  @ApiResponse({ status: 409, description: 'Ya está en la edición' })
  enroll(@Body() dto: EnrollJurorDto, @GetUser('id') actorId: string) {
    return this.service.enroll(dto, actorId);
  }
}
