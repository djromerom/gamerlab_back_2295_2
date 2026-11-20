import {
  Controller, Get, Post, Body, Param, Delete,
  ParseIntPipe, Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth, ApiBody,
} from '@nestjs/swagger';
import { HighlightedGamesService } from '../../highlighted-games/highlighted-games.service';
import { CreateHighlightedGameDto } from '../../highlighted-games/dto/create-highlighted-game.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { RolePermissionGuard } from '../../auth/guards/role-permission.guard';
import { RequiredService } from '../../auth/decorators/required-service.decorator';

@ApiTags('Highlighted Games')
@ApiBearerAuth()
@Controller('editions/:editionId/highlighted-games')
export class HighlightedGamesController {
  constructor(private readonly highlightedGamesService: HighlightedGamesService) { }

  @Post()
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHighlightedGames')
  @ApiOperation({
    summary:
      'Highlight a confirmed live videogame or a historical videogame within an edition',
    description:
      'HU-41 (ARK-229): send exactly one of `videogameId` (live) or `historicalVideogameId` (historical, of this edition).',
  })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          required: ['videogameId'],
          properties: { videogameId: { type: 'number', example: 431 } },
        },
        {
          type: 'object',
          required: ['historicalVideogameId'],
          properties: {
            historicalVideogameId: { type: 'number', example: 87 },
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 201, description: 'Videogame highlighted.' })
  @ApiResponse({
    status: 400,
    description:
      'Both or neither id sent, live videogame not confirmed, or historical videogame not found in this edition.',
  })
  @ApiResponse({ status: 404, description: 'Edition not found.' })
  @ApiResponse({
    status: 409,
    description: 'The videogame is already highlighted in this edition.',
  })
  create(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Body() createHighlightedGameDto: CreateHighlightedGameDto,
  ) {
    return this.highlightedGamesService.create(editionId, createHighlightedGameDto);
  }

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'List highlighted live games for an edition (paginated); historical ones are in GET /highlighted-games',
  })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of highlighted games.' })
  findAll(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.highlightedGamesService.findAll(editionId, query);
  }

  // HU-41 (ARK-229): tiene un segmento más que `:videogameId`, así que las dos rutas no se cruzan.
  @Delete('historical/:historicalVideogameId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHighlightedGames')
  @ApiOperation({
    summary: 'Remove a highlighted historical game from an edition',
  })
  @ApiParam({ name: 'editionId', type: Number })
  @ApiParam({ name: 'historicalVideogameId', type: Number })
  @ApiResponse({ status: 200, description: 'Highlighted game removed.' })
  @ApiResponse({ status: 404, description: 'Highlighted game not found.' })
  removeHistorical(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('historicalVideogameId', ParseIntPipe) historicalVideogameId: number,
  ) {
    return this.highlightedGamesService.removeHistorical(
      editionId,
      historicalVideogameId,
    );
  }

  @Delete(':videogameId')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageHighlightedGames')
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
