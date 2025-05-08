import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { NrcsService } from './nrcs.service';
import { Prisma } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('nrcs')
export class NrcsController {
  constructor(private readonly nrcService: NrcsService) {}

  @Public()
  @Get()
  findAll() {
    return this.nrcService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.nrcService.findOne(id);
  }

  @Post()
  create(@Body() data: Prisma.NRCCreateInput) {
    return this.nrcService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Prisma.NRCUpdateInput,
  ) {
    return this.nrcService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.nrcService.remove(id);
  }
}
