import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { AzureStorageService } from './azure-storage.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RecaptchaService } from '../teams/services/recaptcha.service';
import { ZipUploadAccessGuard } from './zip-upload-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [HttpModule, ConfigModule, SettingsModule],
  controllers: [UploadController],
  providers: [AzureStorageService, PrismaService, RecaptchaService, ZipUploadAccessGuard],
  exports: [AzureStorageService],
})
export class UploadModule {}