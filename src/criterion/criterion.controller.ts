import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { CriterionService } from './criterion.service';
import { CreateCriterionDto } from './dto/create-criterion.dto';


@Controller('criteria')
export class CriterionController {
  constructor(private readonly criterionService: CriterionService) {}

  @Post()
  create(@Body() createCriterionDto: CreateCriterionDto) {
    return this.criterionService.create(createCriterionDto);
  }

  @Get()
  findAll(@Query('includeInactive') includeInactive: boolean = false) {
    return this.criterionService.findAll(includeInactive);
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