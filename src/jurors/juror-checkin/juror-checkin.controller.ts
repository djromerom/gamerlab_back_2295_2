import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import {
  ManualCheckInDto,
  ScanBadgeDto,
  SearchJurorsQueryDto,
} from './dto/juror-checkin.dto';
import { JurorCheckinService } from './juror-checkin.service';

const checkInExample = {
  status: 'CHECKED_IN',
  checkedInAt: '2026-11-26T13:05:12.000Z',
  method: 'QR',
  juror: {
    id: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01',
    name: 'Juror Senior',
    category: 'Senior',
    teams: [{ id: 4, name: 'Pixel Pioneers' }],
  },
};

const checkInDescription =
  'Si el jurado ya estaba registrado no crea otro registro: responde `status: ALREADY_CHECKED_IN` con la hora original. No devuelve correos.';

@ApiTags('Juror check-in')
@Controller('juror-checkin')
@UseGuards(RolePermissionGuard)
@RequiredService('JurorCheckIn')
export class JurorCheckinController {
  constructor(private readonly checkinService: JurorCheckinService) {}

  @Post('scan')
  @ApiOperation({
    summary: 'Registra la llegada de un jurado con el QR de su escarapela',
    description: checkInDescription,
  })
  @ApiResponse({ status: 201, schema: { example: checkInExample } })
  @ApiResponse({
    status: 404,
    description: 'QR no válido, de otra edición o sin edición activa',
  })
  scan(@Body() dto: ScanBadgeDto, @GetUser('id') staffId: string) {
    return this.checkinService.checkInByToken(dto.token, staffId);
  }

  @Get('badge')
  @ApiOperation({
    summary: 'Muestra de quién es un QR sin registrar la llegada (BG-49)',
    description:
      'Misma validación que `POST scan`, pero no crea ni cambia la asistencia. `checkedInAt` es la llegada activa (una anulada no cuenta) o `null`. Después de confirmar, el front llama a `POST scan` con el mismo token. No devuelve correos.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: { juror: checkInExample.juror, checkedInAt: null },
    },
  })
  @ApiResponse({ status: 400, description: 'Falta el token o está vacío' })
  @ApiResponse({
    status: 404,
    description: 'QR no válido, de otra edición o sin edición activa',
  })
  previewBadge(@Query() query: ScanBadgeDto) {
    return this.checkinService.previewBadge(query.token);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Busca jurados por nombre para registrar su llegada a mano',
    description:
      'Solo jurados de la edición activa (externos confirmados y profesores con NRC activo en ella). Incluye a los que no tienen escarapela (`hasBadge: false`). Máximo 20 resultados.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: [
        {
          id: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01',
          name: 'Juror Senior',
          category: 'Senior',
          hasBadge: true,
          checkedInAt: null,
        },
      ],
    },
  })
  search(@Query() query: SearchJurorsQueryDto) {
    return this.checkinService.search(query.q);
  }

  @Post('manual')
  @ApiOperation({
    summary: 'Registra la llegada de un jurado elegido en la búsqueda',
    description: checkInDescription,
  })
  @ApiResponse({
    status: 201,
    schema: { example: { ...checkInExample, method: 'MANUAL' } },
  })
  @ApiResponse({
    status: 404,
    description: 'No es jurado de la edición activa o no hay edición activa',
  })
  manual(@Body() dto: ManualCheckInDto, @GetUser('id') staffId: string) {
    return this.checkinService.checkInManually(dto.jurorId, staffId);
  }
}
