import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { VideogamesService } from './videogames.service';
import { ListVideogamesQueryDto } from './dto/list-videogames-query.dto';
import { CreateVideogameDto } from './dto/create-videogame.dto';
import { UpdateVideogameDto } from './dto/update-videogame.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';
import { RequiredService } from 'src/auth/decorators/required-service.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AppUser } from 'src/auth/jwt.strategy';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard';
import { LikeThrottle } from 'src/common/throttle/public-throttle';
import { Liker, assertSessionIfClaimed, ensureVisitorId, readVisitorId } from './like-visitor';

const ID_PIPE = new ParseIntPipe({
  exceptionFactory: () => new BadRequestException('El identificador debe ser un número entero'),
});

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
  findAll(@Query() query: ListVideogamesQueryDto) {
    return this.videogamesService.findAll(query.limit, query.page);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ID_PIPE) id: number) {
    return this.videogamesService.findOne(id);
  }

  @Public()
  @Get(':id/likes')
  getLikes(@Param('id') id: string) {
    return this.videogamesService.getLikes(+id);
  }

  /**
   * Public: whether the current user (session) or anonymous visitor (cookie) liked the game.
   * Used by the modal on mount to initialise the heart icon correctly.
   */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/my-like')
  getMyLike(
    @Param('id') videogameId: string,
    @GetUser() user: AppUser | undefined,
    @Req() req: Request,
  ) {
    assertSessionIfClaimed(req, user);
    const visitorId = readVisitorId(req);
    const liker: Liker | undefined = user ? { userId: user.id } : visitorId ? { visitorId } : undefined;
    return this.videogamesService.getMyLike(+videogameId, liker);
  }

  /**
   * Public: toggle like. With session the like belongs to the user; without session to an
   * anonymous visitor cookie that this route creates on the first like.
   * The server decides like/unlike based on DB state — never trusts the client.
   * No visitorId in the body — identity comes from the JWT cookie or the visitor cookie.
   */
  // Order matters: OptionalJwtAuthGuard must run before LikeThrottlerGuard (it reads request.user)
  @Public()
  @LikeThrottle()
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/toggle-like')
  toggleLike(
    @Param('id') videogameId: string,
    @GetUser() user: AppUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertSessionIfClaimed(req, user);
    const liker: Liker = user ? { userId: user.id } : { visitorId: ensureVisitorId(req, res) };
    return this.videogamesService.toggleLike(+videogameId, liker);
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