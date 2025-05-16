import { Module } from '@nestjs/common';
import { NrcsService } from './nrcs.service';
import { NrcsController } from './nrcs.controller';

@Module({
  controllers: [NrcsController],
  providers: [NrcsService],
})
export class NrcsModule {}
