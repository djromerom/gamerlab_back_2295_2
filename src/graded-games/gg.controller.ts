import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GradedGamesService } from './gg.service';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { VideogameResponseDto } from './dto/videogame-response.dto';

@Controller('graded-games')
@UseGuards(PendingGamesGuard)
export class GradedGamesController {
  constructor(private readonly GradedGamesService: GradedGamesService) { }

  @Get()
  @RequiredService('PendingGamesService')
  async getGradedVideogames(
    @GetUser('id') jurorId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<VideogameResponseDto>> {
    const { limit, page } = query;
    return this.GradedGamesService.getGradedVideogames(jurorId, limit, page);
  }
}
