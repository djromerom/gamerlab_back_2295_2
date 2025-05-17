import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { VideogamesService } from './pg.service';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

@Controller('pending-games')
@UseGuards(PendingGamesGuard)
export class VideogamesController {
  constructor(private readonly videogamesService: VideogamesService) { }

  @Get()
  @RequiredService('PendingGamesService')
  async getPendingVideogames
    (
      @Query('page') page: number = 1,
      @Query('limit') limit: number = 10,
      @GetUser('id') jurorId: string,
    ) {
    const videogames = await this.videogamesService.getPendingVideogames
      (
        jurorId, // Pasar el jurorId al servicio
        page,
        limit,
      );
    return { jurorId, ...videogames }; // Incluir el ID del jurado en la respuesta
  }
}
