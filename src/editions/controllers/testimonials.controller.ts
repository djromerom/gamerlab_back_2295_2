import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { TestimonialsService } from '../../testimonials/testimonials.service';
import { CreateTestimonialDto } from '../../testimonials/dto/create-testimonial.dto';
import { UpdateTestimonialDto } from '../../testimonials/dto/update-testimonial.dto';
import { ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@ApiTags('Testimonials')
@Controller('editions/:editionId/testimonials')
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) { }

  @Post()
  create(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Body() createTestimonialDto: CreateTestimonialDto,
  ) {
    return this.testimonialsService.create(editionId, createTestimonialDto);
  }

  @Get()
  findAll(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.testimonialsService.findAll(editionId, query);
  }

  @Get(':id')
  findOne(@Param('editionId', ParseIntPipe) editionId: number, @Param('id', ParseIntPipe) id: number) {
    return this.testimonialsService.findOne(editionId, id);
  }

  @Patch(':id')
  update(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTestimonialDto: UpdateTestimonialDto,
  ) {
    return this.testimonialsService.update(editionId, id, updateTestimonialDto);
  }

  @Delete(':id')
  remove(@Param('editionId', ParseIntPipe) editionId: number, @Param('id', ParseIntPipe) id: number) {
    return this.testimonialsService.remove(editionId, id);
  }
}
