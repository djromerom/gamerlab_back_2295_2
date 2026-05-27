import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { EducationalFocusesService } from '../../educational-focuses/educational-focuses.service';
import { CreateEducationalFocusDto } from '../../educational-focuses/dto/create-educational-focus.dto';
import { UpdateEducationalFocusDto } from '../../educational-focuses/dto/update-educational-focus.dto';
import { ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('Educational Focuses')
@Controller('editions/:editionId/educational-focuses')
export class EducationalFocusesController {
  constructor(private readonly educationalFocusesService: EducationalFocusesService) { }

  @Post()
  create(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Body() createEducationalFocusDto: CreateEducationalFocusDto,
  ) {
    return this.educationalFocusesService.create(editionId, createEducationalFocusDto);
  }

  @Public()
  @Get()
  findAll(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.educationalFocusesService.findAll(editionId, query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('editionId', ParseIntPipe) editionId: number, @Param('id', ParseIntPipe) id: number) {
    return this.educationalFocusesService.findOne(editionId, id);
  }

  @Patch(':id')
  update(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEducationalFocusDto: UpdateEducationalFocusDto,
  ) {
    return this.educationalFocusesService.update(editionId, id, updateEducationalFocusDto);
  }

  @Delete(':id')
  remove(@Param('editionId', ParseIntPipe) editionId: number, @Param('id', ParseIntPipe) id: number) {
    return this.educationalFocusesService.remove(editionId, id);
  }
}
