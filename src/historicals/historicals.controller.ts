import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { HistoricalsService } from './historicals.service';
import { CreateHistoricalDto } from './dto/create-historical.dto';
import { UpdateHistoricalDto } from './dto/update-historical.dto';

@Controller('historicals')
export class HistoricalsController {
  constructor(private readonly historicalsService: HistoricalsService) {}

  @Post()
  create(@Body() createHistoricalDto: CreateHistoricalDto) {
    return this.historicalsService.create(createHistoricalDto);
  }

  @Get()
  findAll() {
    return this.historicalsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.historicalsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateHistoricalDto: UpdateHistoricalDto) {
    return this.historicalsService.update(+id, updateHistoricalDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.historicalsService.remove(+id);
  }
}
