import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
  Delete,
} from '@nestjs/common';
import { CriterionService } from './criterion.service';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { Criterion } from "@prisma/client";
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

@Controller('criteria')
export class CriterionController {
  constructor(private readonly criterionService: CriterionService) { }

  @Post()
  create(@Body() createCriterionDto: CreateCriterionDto) {
    return this.criterionService.create(createCriterionDto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResult<Criterion>> {
    const { includeInactive, limit, page } = query;
    return this.criterionService.findAll(includeInactive, limit, page);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.criterionService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateData: Partial<CreateCriterionDto>,
  ) {
    return this.criterionService.update(+id, updateData);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.criterionService.softDelete(+id);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.criterionService.restore(+id);
  }
}
