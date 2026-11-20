// src/graded-games/graded-games.module.ts
import { Module } from '@nestjs/common';
import { GradedGamesService } from './graded-games.service';
import { GradedGamesController } from './graded-games.controller';
import { PrismaService } from '../prisma/prisma.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [GradedGamesController],
  providers: [GradedGamesService, PrismaService],
})
export class GradedGamesModule {}
