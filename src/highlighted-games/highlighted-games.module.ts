import { Module } from '@nestjs/common';
import { HighlightedGamesService } from './highlighted-games.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [HighlightedGamesService],
  exports: [HighlightedGamesService]
})
export class HighlightedGamesModule { }
