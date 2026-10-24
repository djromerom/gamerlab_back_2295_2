import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamVerificationController } from './team-verification.controller';
import { TeamVerificationService } from './team-verification.service';

@Module({
  imports: [PrismaModule],
  controllers: [TeamVerificationController],
  providers: [TeamVerificationService],
  exports: [TeamVerificationService],
})
export class TeamVerificationModule {}
