import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { JurorModule } from 'src/jurors/juror/juror.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JurorEditionImportController } from './import/juror-edition-import.controller';
import { JurorEditionImportMailQueue } from './import/juror-edition-import-mail.queue';
import { JurorEditionImportService } from './import/juror-edition-import.service';
import { JurorEditionController } from './juror-edition.controller';
import { JurorEditionService } from './juror-edition.service';

@Module({
  imports: [PrismaModule, AuthModule, JurorModule],
  controllers: [JurorEditionController, JurorEditionImportController],
  providers: [
    JurorEditionService,
    JurorEditionImportService,
    JurorEditionImportMailQueue,
  ],
  exports: [JurorEditionService],
})
export class JurorEditionModule {}
