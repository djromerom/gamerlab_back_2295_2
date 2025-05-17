// src/graded-games/gg.module.ts
import { Module } from '@nestjs/common';
import { GradedGamesService } from './gg.service';
import { GradedGamesController } from './gg.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [GradedGamesController],
  providers: [GradedGamesService, PrismaService],
})
export class GradedGamesModule {}
