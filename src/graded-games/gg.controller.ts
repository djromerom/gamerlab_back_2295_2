import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { GradedGamesService } from './gg.service';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';

@Controller('graded-games')
@UseGuards(PendingGamesGuard)
export class GradedGamesController {
  constructor(private readonly GradedGamesService: GradedGamesService) {}

  @Get()
  @RequiredService('PendingGamesService')
  async getGradedVideogames(@Request() req) {
    const jurorId = req.user.id; // Obtener el ID del jurado desde el usuario autenticado
    return this.GradedGamesService.getGradedVideogames(jurorId);
  }
}