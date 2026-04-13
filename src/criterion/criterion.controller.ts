import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CriterionService } from './criterion.service';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { Criterion } from '@prisma/client';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SelectOption } from './types/select-option.type';
import { Public } from '../auth/decorators/public.decorator';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';

@Controller('criteria')
export class CriterionController {
  constructor(private readonly criterionService: CriterionService) {}

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('CreateCriterion')
  create(@Body() createCriterionDto: CreateCriterionDto) {
    return this.criterionService.create(createCriterionDto);
  }

  @Get()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ListCriterion')
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<Criterion>> {
    const { includeInactive, limit, page } = query;
    return this.criterionService.findAll(includeInactive, limit, page);
  }

  @Public()
  @Get('select-options')
  findSelectOptions(): Promise<SelectOption[]> {
    return this.criterionService.findForSelect();
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('GetCriterion')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.criterionService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateCriterion')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateData: Partial<CreateCriterionDto>,
  ) {
    return this.criterionService.update(id, updateData);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('DeleteCriterion')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.criterionService.softDelete(id);
  }

  @Patch(':id/restore')
  @UseGuards(RolePermissionGuard)
  @RequiredService('RestoreCriterion')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.criterionService.restore(id);
  }
}
