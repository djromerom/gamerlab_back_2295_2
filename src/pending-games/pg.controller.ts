import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { VideogamesService } from './pg.service';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';

@Controller('pending-games')
@UseGuards(PendingGamesGuard)
export class VideogamesController {
  constructor(private readonly videogamesService: VideogamesService) { }

  @Get()
  @RequiredService('PendingGamesService')
  async getAllVideogamesWithDetails(@Request() req) {
    const jurorId = req.user.id; // Obtener el ID del jurado desde el usuario autenticado
    const videogames = await this.videogamesService.getAllVideogamesWithDetails();
    return { jurorId, videogames }; // Incluir el ID del jurado en la respuesta
  }
}