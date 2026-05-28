import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  ParseIntPipe, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth,
} from '@nestjs/swagger';
import { EducationalFocusesService } from '../../educational-focuses/educational-focuses.service';
import { CreateEducationalFocusDto } from '../../educational-focuses/dto/create-educational-focus.dto';
import { UpdateEducationalFocusDto } from '../../educational-focuses/dto/update-educational-focus.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('Educational Focuses')
@ApiBearerAuth()
@Controller('editions/:editionId/educational-focuses')
export class EducationalFocusesController {
  constructor(private readonly educationalFocusesService: EducationalFocusesService) { }

  @Post()
  @ApiOperation({ summary: 'Create an educational focus for an edition' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiResponse({ status: 201, description: 'Educational focus created.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  create(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Body() createEducationalFocusDto: CreateEducationalFocusDto,
  ) {
    return this.educationalFocusesService.create(editionId, createEducationalFocusDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List educational focuses for an edition (paginated)' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of educational focuses.' })
  findAll(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.educationalFocusesService.findAll(editionId, query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single educational focus by ID' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Educational focus found.' })
  @ApiResponse({ status: 404, description: 'Educational focus not found.' })
  findOne(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.educationalFocusesService.findOne(editionId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an educational focus' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Educational focus updated.' })
  @ApiResponse({ status: 404, description: 'Educational focus not found.' })
  update(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEducationalFocusDto: UpdateEducationalFocusDto,
  ) {
    return this.educationalFocusesService.update(editionId, id, updateEducationalFocusDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an educational focus' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Educational focus deleted.' })
  @ApiResponse({ status: 404, description: 'Educational focus not found.' })
  remove(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.educationalFocusesService.remove(editionId, id);
  }
}
