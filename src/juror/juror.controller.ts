import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { JurorService } from './juror.service';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';
import { UseGuards } from '@nestjs/common';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { User } from '@prisma/client';
import { JurorListItem } from './juror.service';


@Controller('juror')
export class JurorController {
  constructor(private readonly jurorService: JurorService) {}

  @Post()
  create(@Body() dto: CreateJurorDto) {
    return this.jurorService.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResult<JurorListItem>> {
    const { includeInactive, limit, page } = query;
    return this.jurorService.findAll(includeInactive, limit, page);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jurorService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateJurorDto) {
    return this.jurorService.update(id, dto);
  }

  @Patch(':id/delete')
  softdelete(@Param('id') id: string, @Body() dto: UpdateJurorDto) {
    return this.jurorService.remove(id);
  }

  
}
