import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { AzureStorageService } from './azure-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [UploadController],
  providers: [AzureStorageService, PrismaService],
  exports: [AzureStorageService],
})
export class UploadModule {}