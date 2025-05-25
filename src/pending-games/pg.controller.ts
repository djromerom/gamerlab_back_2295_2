import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { VideogamesService } from './pg.service';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { VideogameResponseDto } from './dto/videogame-response.dto';

@Controller('pending-games')
@UseGuards(PendingGamesGuard)
export class VideogamesController {
  constructor(private readonly videogamesService: VideogamesService) { }

  @Get()
  @RequiredService('PendingGamesService')
  async getPendingVideogames(
    @GetUser('id') jurorId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<VideogameResponseDto>> {
    const { limit, page } = query;
    return this.videogamesService.getPendingVideogames(jurorId, limit, page);
  }
}
