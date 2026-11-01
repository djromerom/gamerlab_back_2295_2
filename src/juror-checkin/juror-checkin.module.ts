import { Module } from '@nestjs/common';
import { JurorBadgesModule } from '../juror-badges/juror-badges.module';
import { PrismaModule } from '../prisma/prisma.module';
import { JurorCheckinController } from './juror-checkin.controller';
import { JurorCheckinService } from './juror-checkin.service';

@Module({
  imports: [PrismaModule, JurorBadgesModule],
  controllers: [JurorCheckinController],
  providers: [JurorCheckinService],
})
export class JurorCheckinModule {}
