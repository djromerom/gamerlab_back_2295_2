import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GradedGamesService } from './graded-games.service';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/types/paginated-result.type';
import { VideogameResponseDto } from './dto/videogame-response.dto';
import { RolePermissionGuard } from 'src/auth/guards/role-permission.guard';

@Controller('graded-games')
@UseGuards(RolePermissionGuard)
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

  @Get('search')
  @RequiredService('PendingGamesService')
  async searchGradedGames(
    @GetUser('id') jurorId: string,
    @Query('q') search: string = '',
  ) {
    return this.GradedGamesService.searchGradedGames(jurorId, search);
  }

  @Get('count')
  @RequiredService('PendingGamesService')
  async getGradedVideogamesCount(
    @GetUser('id') jurorId: string,
  ): Promise<{ count: number }> {
    const count = await this.GradedGamesService.getGradedVideogamesCount(jurorId);
    return { count };
  }

  @Get('search/quick')
  @RequiredService('PendingGamesService')
  async quickSearchGradedGames(
    @GetUser('id') jurorId: string,
    @Query('q') search: string = '',
  ) {
    return this.GradedGamesService.quickSearchGradedGames(jurorId, search);
  }
}
