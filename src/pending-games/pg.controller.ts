import { Controller, Get, UseGuards } from '@nestjs/common';
import { VideogamesService } from './pg.service';
import { PendingGamesGuard } from '../auth/guards/pending-games.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';

@Controller('pending-games')
@UseGuards(PendingGamesGuard)
export class VideogamesController {
  constructor(private readonly videogamesService: VideogamesService) {}

  @Get()
  @RequiredService('PendingGamesService')
  async getAllVideogamesWithDetails() {
    return this.videogamesService.getAllVideogamesWithDetails();
  }
}