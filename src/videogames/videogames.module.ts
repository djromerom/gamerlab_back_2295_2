import { Module } from '@nestjs/common';
import { VideogamesController } from './videogames.controller';
import { VideogamesService } from './videogames.service';
import { PrismaService } from '../prisma/prisma.service';
import { VideogamesGateway } from './videogames.gateway';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [VideogamesController],
  providers: [VideogamesService, PrismaService, VideogamesGateway],
})
export class VideogameModule {}
