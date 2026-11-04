import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
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
