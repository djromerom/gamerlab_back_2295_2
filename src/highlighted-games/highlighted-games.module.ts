import { Module } from '@nestjs/common';
import { HighlightedGamesService } from './highlighted-games.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadModule } from '../upload/upload.module';
import { PublicHighlightedGamesController } from './highlighted-games.controller';

@Module({
  imports: [PrismaModule, UploadModule],
  controllers: [PublicHighlightedGamesController],
  providers: [HighlightedGamesService],
  exports: [HighlightedGamesService]
})
export class HighlightedGamesModule { }
