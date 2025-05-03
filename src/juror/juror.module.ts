import { Module } from '@nestjs/common';
import { JurorService } from './juror.service';
import { JurorController } from './juror.controller';

@Module({
  controllers: [JurorController],
  providers: [JurorService],
})
export class JurorModule {}
