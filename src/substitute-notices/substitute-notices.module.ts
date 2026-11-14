import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubstituteNoticesController } from './substitute-notices.controller';
import { SubstituteNoticesService } from './substitute-notices.service';

/** HU-22 (ARK-84): aviso "Te asignaron grupos" al suplente. Lo usa la asignación manual. */
@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [SubstituteNoticesController],
  providers: [SubstituteNoticesService],
  exports: [SubstituteNoticesService],
})
export class SubstituteNoticesModule {}
