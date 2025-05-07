import { Module } from '@nestjs/common';
import { JurorService } from './juror.service';
import { JurorController } from './juror.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [JurorController],
  providers: [JurorService],
})
export class JurorModule {}
