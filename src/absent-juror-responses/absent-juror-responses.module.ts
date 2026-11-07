import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AbsentJurorResponsesController } from './absent-juror-responses.controller';
import { AbsentJurorResponsesService } from './absent-juror-responses.service';

@Module({
  imports: [PrismaModule],
  controllers: [AbsentJurorResponsesController],
  providers: [AbsentJurorResponsesService],
})
export class AbsentJurorResponsesModule {}
