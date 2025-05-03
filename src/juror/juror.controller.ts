import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { JurorService } from './juror.service';
import { CreateJurorDto } from './dto/create-juror.dto';
import { UpdateJurorDto } from './dto/update-juror.dto';

@Controller('juror')
export class JurorController {
  constructor(private readonly jurorService: JurorService) {}

  @Post()
  create(@Body() dto: CreateJurorDto) {
    return this.jurorService.create(dto);
  }

  @Get()
  findAll() {
    return this.jurorService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jurorService.findOne(id);
  }

  @Get(':id/summary')
  getSummary(@Param('id') id: string) {
    return this.jurorService.getJurorSummary(id);
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
