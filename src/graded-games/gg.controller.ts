import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { GradedGamesService } from './gg.service';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@Controller('graded-games')
@UseGuards(PendingGamesGuard)
export class GradedGamesController {
  constructor(private readonly GradedGamesService: GradedGamesService) { }

  @Get()
  @RequiredService('PendingGamesService')
  async getGradedVideogames
    (
      @Query('page') page: number = 1,
      @Query('limit') limit: number = 10,
      @GetUser('id') jurorId: string,
    ) {
    const videogames = await this.GradedGamesService.getGradedVideogames
      (
        jurorId,
        page,
        limit,
      );
    return { jurorId, ...videogames };
  }
}
