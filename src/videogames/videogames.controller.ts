import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { VideogamesService } from './videogames.service';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AppUser } from 'src/auth/jwt.strategy';

@Controller('videogames')
export class VideogamesController {
  constructor(private readonly videogamesService: VideogamesService) { }

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageVideogames')
  create(@Body() createVideogameDto: CreateVideogameDto) {
    return this.videogamesService.create(createVideogameDto);
  }

  @Public()
  @Get()
  findAll() {
    return this.videogamesService.findAll();
  }

  @Public()
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
   * Authenticated: returns whether the current user has liked the game.
   * Used by the modal on mount to initialise the heart icon correctly.
   */
  @Get(':id/my-like')
  getMyLike(
    @Param('id') videogameId: string,
    @GetUser() user: AppUser,
  ) {
    return this.videogamesService.getMyLike(+videogameId, user.id);
  }

  /**
   * Authenticated: toggle like for the current user.
   * The server decides like/unlike based on DB state — never trusts the client.
   * No visitorId in the body — identity comes from the JWT cookie.
   */
  @Post(':id/toggle-like')
  toggleLike(
    @Param('id') videogameId: string,
    @GetUser() user: AppUser,
  ) {
    return this.videogamesService.toggleLike(+videogameId, user.id);
  }

  @Patch(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('UpdateVideogame')
  update(
    @Param('id') id: string,
    @Body() updateVideogameDto: UpdateVideogameDto,
    @GetUser() user: AppUser,
  ) {
    return this.videogamesService.update(+id, updateVideogameDto, user);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageVideogames')
  remove(@Param('id') id: string) {
    return this.videogamesService.remove(+id);
  }
}