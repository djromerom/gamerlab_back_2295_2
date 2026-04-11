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

  /**
   * CHANGED: Route is now POST :id/toggle-like (no :liked param).
   * The client sends { visitorId } in the body.
   * The server determines like/unlike based on DB state — never trusts the client.
   *
   * Before: POST /videogames/1/toggle-like/true  ← client controlled the action
   * After:  POST /videogames/1/toggle-like        ← server controls the action
   *         Body: { "visitorId": "uuid-or-fingerprint" }
   */
  @Public()
  @Post(':id/toggle-like')
  toggleLike(
    @Param('id') videogameId: string,
    @Body('visitorId') visitorId: string,
  ) {
    return this.videogamesService.toggleLike(+videogameId, visitorId);
  }

  @Put(':id/likes')
  @UseGuards(RolePermissionGuard)
  @RequiredService('SetLikes')
  setLikes(
    @Param('id') videogameId: string,
    @Body() setLikesDto: { likes: number },
  ) {
    return this.videogamesService.setLikes(+videogameId, setLikesDto.likes);
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