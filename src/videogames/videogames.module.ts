import { Module } from '@nestjs/common';
import { VideogamesController } from './videogames.controller';
import { VideogamesService } from './videogames.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [VideogamesController],
  providers: [VideogamesService, PrismaService],
})
export class VideogameModule {}
