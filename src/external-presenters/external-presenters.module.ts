import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ExternalPresenterCertificatesService } from './external-presenter-certificates.service';
import { ExternalPresentersController } from './external-presenters.controller';
import { ExternalPresentersService } from './external-presenters.service';

/** HU-33 (ARK-194): presentadores externos de la edición. */
@Module({
  imports: [PrismaModule, AuthModule, CertificatesModule, EmailModule],
  controllers: [ExternalPresentersController],
  providers: [ExternalPresentersService, ExternalPresenterCertificatesService],
})
export class ExternalPresentersModule {}
