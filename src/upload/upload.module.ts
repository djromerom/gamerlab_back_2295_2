import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { AzureStorageService } from './azure-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { BlobReferenceService } from './blob-reference.service';

@Module({
  controllers: [UploadController],
  providers: [AzureStorageService, BlobReferenceService, PrismaService],
  exports: [AzureStorageService, BlobReferenceService],
})
export class UploadModule {}