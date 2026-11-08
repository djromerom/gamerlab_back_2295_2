import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Patch,
  Delete,
  ParseIntPipe,
  ParseBoolPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { NrcsService } from './nrcs.service';
import { NRC } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { SelectOption } from './types/select-option.type';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { CreateNrcDto } from './dto/create-nrc.dto';
import { UpdateNrcDto } from './dto/update-nrc.dto';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { editionIdQuery, ListEdition } from '../editions/list-edition';

@ApiTags('NRCs')
@Controller('nrcs')
export class NrcsController {
  constructor(private readonly nrcService: NrcsService) { }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListNrcs')
  @ApiOperation({ summary: 'Lista paginada de NRC de una edición (administrador)' })
  @ApiQuery({
    name: 'editionId',
    required: false,
    type: Number,
    description:
      'ARK-136: NRC de esa edición. Por defecto, la edición activa (sin edición activa, lista vacía). 400 si no es un entero positivo, 404 si la edición no existe.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        data: [{ id: 12, code: 2501, subjectId: 1, professorId: 'uuid', editionId: 4, isActive: true }],
        metadata: { totalItems: 1, itemsOnCurrentPage: 1, currentPage: 1, itemsPerPage: 20, totalPages: 1 },
        edition: { id: 4, title: 'Feria 2026-1', status: 'INACTIVE', readOnly: true },
      },
    },
  })
  findAll(
    @Query() query: PaginationQueryDto,
    @Query('editionId') editionIdParam?: string,
  ): Promise<PaginatedResult<NRC> & { edition: ListEdition | null }> {
    const { includeInactive, limit, page } = query;
    return this.nrcService.findAll(
      includeInactive,
      limit,
      page,
      editionIdQuery(editionIdParam),
    );
  }

  @Get('registration-readiness')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListNrcs')
  @ApiOperation({
    summary: 'Si la edición activa tiene NRC activos (aviso antes de abrir inscripciones)',
    description:
      'ARK-136 (BG-23): el panel lo consulta al abrir las inscripciones. Sin NRC activos nadie termina de inscribirse; solo informa, no bloquea.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: { edition: { id: 5, title: 'Feria 2026-2' }, activeNrcCount: 0, hasActiveNrcs: false },
    },
  })
  registrationReadiness() {
    return this.nrcService.registrationReadiness();
  }

  @Public()
  @Get('select-options')
  @ApiOperation({
    summary: 'List NRC select options with subject and edition IDs',
  })
  @ApiQuery({
    name: 'includeSubjects',
    required: false,
    type: Boolean,
    description:
      'Also include subject (id, name, abrevName) and professorName (HU-31 selector)',
  })
  @ApiResponse({
    status: 200,
    description: 'Active NRCs; this endpoint is public.',
    schema: {
      example: [
        {
          id: 3,
          code: 2501,
          subjectId: 1,
          editionId: 3,
          subject: { id: 1, name: 'Programación Orientada a Objetos', abrevName: 'POO' },
          professorName: 'Ana Pérez',
        },
      ],
    },
  })
  async findSelectOptions(
    @Query('includeSubjects', new DefaultValuePipe(false), ParseBoolPipe)
    includeSubjects: boolean,
  ): Promise<SelectOption[]> {
    return this.nrcService.findForSelect(includeSubjects);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListNrcs')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.nrcService.findOne(id);
  }

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('CreateNrc')
  create(@Body() data: CreateNrcDto) {
    return this.nrcService.create(data);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateNrc')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateNrcDto,
  ) {
    return this.nrcService.update(id, data);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteNrc')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.nrcService.remove(id);
  }
}
