import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Patch,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { NrcsService } from './nrcs.service';
import { Prisma, NRC } from '@prisma/client';
import { Public } from 'src/auth/decorators/public.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';


@Controller('nrcs')
export class NrcsController {
  constructor(private readonly nrcService: NrcsService) { }

  @Public()
  @Get()
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResult<NRC>> {
    const { includeInactive, limit, page } = query;
    return this.nrcService.findAll(includeInactive, limit, page);
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
