import {
  Controller, Get, Post, Body, Param, Delete,
  ParseIntPipe, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth,
} from '@nestjs/swagger';
import { HighlightedGamesService } from '../../highlighted-games/highlighted-games.service';
import { CreateHighlightedGameDto } from '../../highlighted-games/dto/create-highlighted-game.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('Highlighted Games')
@ApiBearerAuth()
@Controller('editions/:editionId/highlighted-games')
export class HighlightedGamesController {
  constructor(private readonly highlightedGamesService: HighlightedGamesService) { }

  @Post()
  @ApiOperation({ summary: 'Highlight a confirmed videogame within an edition' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiResponse({ status: 201, description: 'Videogame highlighted.' })
  @ApiResponse({ status: 400, description: 'Videogame is not confirmed.' })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  create(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Body() createHighlightedGameDto: CreateHighlightedGameDto,
  ) {
    return this.highlightedGamesService.create(editionId, createHighlightedGameDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List highlighted games for an edition (paginated)' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of highlighted games.' })
  findAll(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.highlightedGamesService.findAll(editionId, query);
  }

  @Delete(':videogameId')
  @ApiOperation({ summary: 'Remove a highlighted game from an edition' })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiParam({ name: 'videogameId', type: Number })
  @ApiResponse({ status: 200, description: 'Highlighted game removed.' })
  @ApiResponse({ status: 404, description: 'Highlighted game not found.' })
  remove(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('videogameId', ParseIntPipe) videogameId: number,
  ) {
    return this.highlightedGamesService.remove(editionId, videogameId);
  }
}
