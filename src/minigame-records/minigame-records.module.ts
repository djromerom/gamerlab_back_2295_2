import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MinigameRecordsController } from './minigame-records.controller';
import { MinigameRecordsService } from './minigame-records.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MinigameRecordsController],
  providers: [MinigameRecordsService],
})
export class MinigameRecordsModule {}
