import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JurorPresenceController } from './juror-presence.controller';
import { JurorPresenceService } from './juror-presence.service';

@Module({
  imports: [PrismaModule],
  controllers: [JurorPresenceController],
  providers: [JurorPresenceService],
  // HU-14 (ARK-213): la contingencia usa la «posible salida» para el jurado que se retira.
  exports: [JurorPresenceService],
})
export class JurorPresenceModule {}
