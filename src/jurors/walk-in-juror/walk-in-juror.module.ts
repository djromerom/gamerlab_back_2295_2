import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WalkInJurorController } from './walk-in-juror.controller';
import { WalkInJurorService } from './walk-in-juror.service';

/** HU-24 (ARK-217): alta del jurado de último momento. */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WalkInJurorController],
  providers: [WalkInJurorService],
})
export class WalkInJurorModule {}
