import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JurorPresenceController } from './juror-presence.controller';
import { JurorPresenceService } from './juror-presence.service';

@Module({
  imports: [PrismaModule],
  controllers: [JurorPresenceController],
  providers: [JurorPresenceService],
})
export class JurorPresenceModule {}
