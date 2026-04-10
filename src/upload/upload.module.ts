import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { AzureStorageService } from './azure-storage.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [UploadController],
  providers: [AzureStorageService, PrismaService],
})
export class UploadModule {}
