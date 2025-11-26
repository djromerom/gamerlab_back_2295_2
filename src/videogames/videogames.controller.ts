import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
} from '@nestjs/common';
import { VideogamesService } from './videogames.service';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';

@Controller('videogames')
export class VideogamesController {
  constructor(private readonly videogamesService: VideogamesService) {}

  @Post()
  create(@Body() createVideogameDto: CreateVideogameDto) {
    return this.videogamesService.create(createVideogameDto);
  }
  //ruta publica
  @Public()
  @Get()
  findAll() {
    return this.videogamesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.videogamesService.findOne(+id);
  }

  @Public()
  @Get(':id/likes')
  getLikes(@Param('id') id: string) {
    return this.videogamesService.getLikes(+id);
  }

  @Public()
  @Post(':id/toggle-like/:liked')
  toggleLike(
    @Param('id') videogameId: string,
    @Param('liked') liked: boolean,
  ) {
    return this.videogamesService.toggleLike(+videogameId, liked);
  }

  @Put(':id/likes/:likes')
  @UseGuards(RolePermissionGuard)
  @RequiredService('SetLikes')
  setLikes(
    @Param('id') videogameId: string,
    @Param('likes') likes: string,
  ) {
    return this.videogamesService.setLikes(+videogameId, +likes);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateVideogameDto: UpdateVideogameDto,
  ) {
    return this.videogamesService.update(+id, updateVideogameDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.videogamesService.remove(+id);
  }
}
