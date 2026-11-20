import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsAdmin } from '../auth/decorators/is-admin.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  AdminRoleGuard,
  OptionalAdminRoleGuard,
} from '../auth/guards/admin-role.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  PUBLIC_LIMITS,
  PublicThrottle,
} from '../common/throttle/public-throttle';
import { CreateMinigameRecordDto } from './dto/create-minigame-record.dto';
import { ListMinigameRecordsDto } from './dto/list-minigame-records.dto';
import { MinigameRecordsService } from './minigame-records.service';

const TOP_EXAMPLE = {
  game: 'ARKAD_JAM',
  track: 'guitarra-3',
  top: [
    {
      position: 1,
      alias: 'Pixel',
      score: 41250,
      track: 'guitarra-3',
      createdAt: '2026-11-26T15:02:11.000Z',
    },
    {
      position: 2,
      alias: 'Nova',
      score: 38900,
      track: 'guitarra-3',
      createdAt: '2026-11-26T14:40:03.000Z',
    },
  ],
};

/**
 * HU-52 (ARK-315): récords globales de los minijuegos de la landing (Arkadash y Arkad Jam).
 * Públicos, sin sesión y con límite de peticiones por IP. Solo guardan alias y puntaje.
 */
@ApiTags('Minigame Records')
@Controller('minigame-records')
export class MinigameRecordsController {
  constructor(
    private readonly minigameRecordsService: MinigameRecordsService,
  ) {}

  @Public()
  @PublicThrottle(PUBLIC_LIMITS.minigameRecordsTop)
  @UseGuards(OptionalJwtAuthGuard, OptionalAdminRoleGuard)
  @Get()
  @ApiOperation({
    summary: 'Top 5 of a landing minigame (Arkadash, or one Arkad Jam song)',
    description:
      'Arkadash: one global top. Arkad Jam: the top of the song in `track` (`<instrument>-<index>`); without `track`, the top of all songs. Highest score first; on a tie, the earliest first. Only the Administrator receives the `id` of each record, to delete it.',
  })
  @ApiResponse({ status: 200, schema: { example: TOP_EXAMPLE } })
  @ApiResponse({
    status: 400,
    description: 'Unknown game or track (code MINIGAME_RECORD_INVALID).',
  })
  @ApiResponse({ status: 429, description: 'Too many requests from this IP.' })
  top(@Query() query: ListMinigameRecordsDto, @IsAdmin() isAdmin: boolean) {
    return this.minigameRecordsService.top(query, isAdmin);
  }

  // Solo el Administrador: quita un alias grosero o un puntaje falso de la pantalla principal.
  @UseGuards(AdminRoleGuard)
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a minigame record (Administrator only)',
    description:
      'Returns the top of that game or song without it (with the `id` of each record). The others move up one place.',
  })
  @ApiResponse({ status: 200, schema: { example: TOP_EXAMPLE } })
  @ApiResponse({ status: 401, description: 'No session.' })
  @ApiResponse({ status: 403, description: 'Not an Administrator.' })
  @ApiResponse({
    status: 404,
    description: 'The record does not exist (code MINIGAME_RECORD_NOT_FOUND).',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.minigameRecordsService.remove(id);
  }

  @Public()
  @PublicThrottle(PUBLIC_LIMITS.minigameRecordsSave)
  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Save a score in the top of a landing minigame',
    description:
      'Saves the score only if it beats the top 5 of that game or song (`saved: true` and its `position`). Otherwise `saved: false` and the current top. Lower scores are removed: only the top 5 is kept.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { ...TOP_EXAMPLE, saved: true, position: 1 } },
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid data: MINIGAME_RECORD_INVALID (game or track), MINIGAME_ALIAS_INVALID (3 to 12 characters), MINIGAME_ALIAS_PERSONAL_DATA (codes, documents or phones), MINIGAME_ALIAS_OFFENSIVE (offensive words) or MINIGAME_SCORE_IMPOSSIBLE (over the cap of the game).',
  })
  @ApiResponse({ status: 429, description: 'Too many requests from this IP.' })
  save(@Body() dto: CreateMinigameRecordDto) {
    return this.minigameRecordsService.save(dto);
  }
}
