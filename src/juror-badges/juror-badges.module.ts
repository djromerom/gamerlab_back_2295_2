import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { PrismaModule } from '../prisma/prisma.module';
import { JurorBadgesController } from './juror-badges.controller';
import { JurorBadgesService } from './juror-badges.service';

@Module({
  imports: [PrismaModule, CertificatesModule],
  controllers: [JurorBadgesController],
  providers: [JurorBadgesService],
  exports: [JurorBadgesService],
})
export class JurorBadgesModule {}
