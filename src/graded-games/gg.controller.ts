import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { GradedGamesService } from './gg.service';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';

@Controller('graded-games')
@UseGuards(PendingGamesGuard)
export class GradedGamesController {
  constructor(private readonly GradedGamesService: GradedGamesService) {}

  @Get()
  @RequiredService('PendingGamesService')
  async getGradedVideogames
  (
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Request() req,
  ) {
    const jurorId = req.user.id; // Obtener el ID del jurado desde el usuario autenticado
    const videogames = await this.GradedGamesService.getGradedVideogames
    (
      jurorId, // Pasar el jurorId al servicio
      page,
      limit,
    );
    return { jurorId, ...videogames }; // Incluir el ID del jurado en la respuesta
  }
}