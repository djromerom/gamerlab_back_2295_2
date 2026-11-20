import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/auth/decorators/public.decorator';
import { HighlightedGamesService } from './highlighted-games.service';
import { ListHighlightedGamesDto } from './dto/list-highlighted-games.dto';

/**
 * HU-41 (ARK-229): juegos destacados de cualquier edición para la landing, en vivo e históricos.
 * La administración (agregar y quitar) está en `editions/:editionId/highlighted-games`.
 */
@ApiTags('Highlighted Games')
@Controller('highlighted-games')
export class PublicHighlightedGamesController {
  constructor(
    private readonly highlightedGamesService: HighlightedGamesService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'List highlighted games of every edition (live and historical) for the landing page',
  })
  @ApiQuery({
    name: 'editionId',
    type: Number,
    required: false,
    description: 'Only the highlights of this edition.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Highlighted games, most recent edition first and then by name. Without personal data.',
    schema: {
      example: [
        {
          id: 12,
          name: 'Ecos del Aula',
          teamName: 'Los Pixeles',
          edition: {
            id: 4,
            year: 2026,
            semester: 10,
            title: 'Feria Gamer 2026 - S1',
          },
          logoUrl: 'https://…',
          hasGameFile: true,
          play: { type: 'live', id: 431 },
        },
        {
          id: 15,
          name: 'Ruta 66',
          teamName: 'Byte Club',
          edition: {
            id: 3,
            year: 2025,
            semester: 30,
            title: 'Feria Gamer 2025 - S2',
          },
          logoUrl: null,
          hasGameFile: false,
          play: { type: 'historical', id: 87 },
        },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'editionId is not an integer.' })
  findAll(@Query() query: ListHighlightedGamesDto) {
    return this.highlightedGamesService.findPublic(query.editionId);
  }
}
