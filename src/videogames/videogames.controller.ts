import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { VideogamesService } from './videogames.service';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';

@Controller('videogames')
export class VideogamesController {
  constructor(private readonly videogamesService: VideogamesService) {}

  @Post()
  create(@Body() createVideogameDto: CreateVideogameDto) {
    return this.videogamesService.create(createVideogameDto);
  }

  @Get()
  findAll() {
    return this.videogamesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.videogamesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateVideogameDto: UpdateVideogameDto) {
    return this.videogamesService.update(+id, updateVideogameDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.videogamesService.remove(+id);
  }
}
