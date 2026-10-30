import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  ParseIntPipe, Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth,
} from '@nestjs/swagger';
import { TestimonialsService } from '../../testimonials/testimonials.service';
import { CreateTestimonialDto } from '../../testimonials/dto/create-testimonial.dto';
import { UpdateTestimonialDto } from '../../testimonials/dto/update-testimonial.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { RolePermissionGuard } from '../../auth/guards/role-permission.guard';
import { RequiredService } from '../../auth/decorators/required-service.decorator';

@ApiTags('Testimonials')
@ApiBearerAuth()
@Controller('editions/:editionId/testimonials')
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) { }

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageTestimonials')
  @ApiOperation({ summary: 'Create a testimonial for an edition' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiResponse({ status: 201, description: 'Testimonial created.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  create(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Body() createTestimonialDto: CreateTestimonialDto,
  ) {
    return this.testimonialsService.create(editionId, createTestimonialDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List testimonials for an edition (paginated)' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of testimonials.' })
  findAll(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.testimonialsService.findAll(editionId, query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single testimonial by ID' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Testimonial found.' })
  @ApiResponse({ status: 404, description: 'Testimonial not found.' })
  findOne(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.testimonialsService.findOne(editionId, id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageTestimonials')
  @ApiOperation({ summary: 'Update a testimonial' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Testimonial updated.' })
  @ApiResponse({ status: 404, description: 'Testimonial not found.' })
  update(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTestimonialDto: UpdateTestimonialDto,
  ) {
    return this.testimonialsService.update(editionId, id, updateTestimonialDto);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageTestimonials')
  @ApiOperation({ summary: 'Delete a testimonial' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Testimonial deleted.' })
  @ApiResponse({ status: 404, description: 'Testimonial not found.' })
  remove(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.testimonialsService.remove(editionId, id);
  }
}
