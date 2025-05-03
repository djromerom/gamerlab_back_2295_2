import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { NrcsService } from './nrcs.service';
import { CreateNrcDto } from './dto/create-nrc.dto';
import { UpdateNrcDto } from './dto/update-nrc.dto';

@Controller('nrcs')
export class NrcsController {
  constructor(private readonly nrcsService: NrcsService) {}

  @Post()
  create(@Body() createNrcDto: CreateNrcDto) {
    return this.nrcsService.create(createNrcDto);
  }

  @Get()
  findAll() {
    return this.nrcsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nrcsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateNrcDto: UpdateNrcDto) {
    return this.nrcsService.update(+id, updateNrcDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nrcsService.remove(+id);
  }
}
