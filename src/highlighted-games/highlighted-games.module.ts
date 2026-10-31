import { Module } from '@nestjs/common';
import { HighlightedGamesService } from './highlighted-games.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, UploadModule],
  providers: [HighlightedGamesService],
  exports: [HighlightedGamesService]
})
export class HighlightedGamesModule { }
