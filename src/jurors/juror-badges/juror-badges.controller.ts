import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { BADGE_LAYOUTS, DEFAULT_BADGE_PAPER_SIZE } from './badge-template';
import {
  BadgesPdfQueryDto,
  GenerateBadgesDto,
} from './dto/generate-badges.dto';
import { JurorBadgesService } from './juror-badges.service';

@ApiTags('Juror badges')
@Controller('juror-badges')
@UseGuards(RolePermissionGuard)
@RequiredService('ManageJurorBadges')
export class JurorBadgesController {
  constructor(private readonly badgesService: JurorBadgesService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Genera las escarapelas de la edición activa',
    description:
      'Crea el token del QR de los jurados de la edición activa (externos confirmados y profesores con NRC activo en ella) que aún no lo tienen. Idempotente. Omite a quien tenga datos incompletos o no sea de la edición y lo informa en `skipped`.',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        editionId: 3,
        created: 12,
        existing: 30,
        skipped: [
          {
            jurorId: '5e1c7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c01',
            name: 'Ana',
            reason: 'Falta el nombre o el apellido del jurado',
          },
        ],
      },
    },
  })
  generate(@Body() dto: GenerateBadgesDto) {
    return this.badgesService.generate(dto.jurorIds);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista las escarapelas activas de la edición activa',
  })
  list() {
    return this.badgesService.list();
  }

  @Get('pdf')
  @ApiOperation({ summary: 'PDF imprimible con las escarapelas y su QR' })
  @ApiProduces('application/pdf')
  async pdf(@Query() query: BadgesPdfQueryDto) {
    const paper = query.paper ?? DEFAULT_BADGE_PAPER_SIZE;
    const pdf = await this.badgesService.generatePdf(query.jurorIds, paper);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="escarapelas-${BADGE_LAYOUTS[paper].fileLabel}.pdf"`,
    });
  }

  @Post(':jurorId/regenerate')
  @ApiOperation({
    summary: 'Regenera la escarapela de un jurado',
    description: 'Invalida el QR anterior y crea uno nuevo.',
  })
  regenerate(@Param('jurorId', ParseUUIDPipe) jurorId: string) {
    return this.badgesService.regenerate(jurorId);
  }
}
