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
import { Prisma, NRC } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { SelectOption } from './types/select-option.type';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';

@Controller('nrcs')
export class NrcsController {
  constructor(private readonly nrcService: NrcsService) {}

  @Public()
  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResult<NRC>> {
    const { includeInactive, limit, page } = query;
    return this.nrcService.findAll(includeInactive, limit, page);
  }

  @Public()
  @Get('select-options')
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
  create(@Body() data: Prisma.NRCCreateInput) {
    return this.nrcService.create(data);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateNrc')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Prisma.NRCUpdateInput,
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