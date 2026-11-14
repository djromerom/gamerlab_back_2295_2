import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JurorEditionController } from './juror-edition.controller';
import { JurorEditionService } from './juror-edition.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [JurorEditionController],
  providers: [JurorEditionService],
  exports: [JurorEditionService],
})
export class JurorEditionModule {}
