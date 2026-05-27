import { Controller, Get, Post, Body, Param, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { HighlightedGamesService } from '../../highlighted-games/highlighted-games.service';
import { CreateHighlightedGameDto } from '../../highlighted-games/dto/create-highlighted-game.dto';
import { ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('Highlighted Games')
@Controller('editions/:editionId/highlighted-games')
export class HighlightedGamesController {
  constructor(private readonly highlightedGamesService: HighlightedGamesService) { }

  @Post()
  create(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Body() createHighlightedGameDto: CreateHighlightedGameDto,
  ) {
    return this.highlightedGamesService.create(editionId, createHighlightedGameDto);
  }

  @Public()
  @Get()
  findAll(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.highlightedGamesService.findAll(editionId, query);
  }

  @Delete(':videogameId')
  remove(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('videogameId', ParseIntPipe) videogameId: number,
  ) {
    return this.highlightedGamesService.remove(editionId, videogameId);
  }
}
