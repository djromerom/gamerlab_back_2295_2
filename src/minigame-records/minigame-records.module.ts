import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MinigameRecordsController } from './minigame-records.controller';
import { MinigameRecordsService } from './minigame-records.service';

@Module({
  imports: [PrismaModule],
  controllers: [MinigameRecordsController],
  providers: [MinigameRecordsService],
})
export class MinigameRecordsModule {}
