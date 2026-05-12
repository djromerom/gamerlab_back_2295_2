import { Module } from '@nestjs/common';
import { VideogamesController } from './videogames.controller';
import { VideogamesService } from './videogames.service';
import { PrismaService } from '../prisma/prisma.service';
import { VideogamesGateway } from './videogames.gateway';

@Module({
  controllers: [VideogamesController],
  providers: [VideogamesService, PrismaService, VideogamesGateway],
})
export class VideogameModule {}
