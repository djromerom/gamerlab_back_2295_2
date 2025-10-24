import { Injectable } from '@nestjs/common';
import { BlobServiceClient, BlockBlobClient, BlobSASPermissions, StorageSharedKeyCredential, generateBlobSASQueryParameters } from '@azure/storage-blob';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { Upload } from '@prisma/client';

@Injectable()
export class AzureStorageService {
  private containerClient;

  constructor(private readonly prisma: PrismaService) {
    const sasUrl = process.env.AZURE_BLOB_SAS_URL;
    if (!sasUrl) throw new Error('AZURE_BLOB_SAS_URL no está definido en .env');
    const blobServiceClient = new BlobServiceClient(sasUrl);
    this.containerClient = blobServiceClient.getContainerClient('');
  }

  async uploadFile(file: Express.Multer.File): Promise<Upload> {
    const blobName = `${Date.now()}-${path.basename(file.originalname)}`;
    const blockBlobClient: BlockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    return this.prisma.upload.create({
      data: {
        blobName,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        isPublic: false,
      },
    });
  }

  async getById(id: string): Promise<Upload | null> {
    return this.prisma.upload.findUnique({ where: { id } });
  }

  // Genera SAS de lectura por blob (dinámico)
  async getReadSasUrlById(id: string, ttlSec: number = 900): Promise<{ url: string, expiresAt: string }> {
    const rec = await this.getById(id);
    if (!rec) throw new Error('Registro no encontrado');

    const accountName = process.env.AZURE_ACCOUNT_NAME;
    const accountKey  = process.env.AZURE_ACCOUNT_KEY;
    const container   = process.env.AZURE_CONTAINER || this.containerClient.containerName;

    if (!accountName || !accountKey) {
      throw new Error('Faltan AZURE_ACCOUNT_NAME o AZURE_ACCOUNT_KEY en .env');
    }

    const cred = new StorageSharedKeyCredential(accountName, accountKey);
    const service = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, cred);
    const containerClient = service.getContainerClient(container);

    const expiresOn = new Date(Date.now() + Math.max(60, ttlSec) * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: container,
        blobName: rec.blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      cred,
    ).toString();

    const signedUrl = `${containerClient.getBlockBlobClient(rec.blobName).url}?${sas}`;
    return { url: signedUrl, expiresAt: expiresOn.toISOString() };
  }

  // Marca como público (flag) sin guardar SAS
  async markPublic(id: string, isPublic = true): Promise<Upload> {
    return this.prisma.upload.update({
      where: { id },
      data: { isPublic },
    });
  }

  // Elimina blob y registro
  async deleteById(id: string): Promise<{ id: string, deleted: boolean }> {
    const rec = await this.getById(id);
    if (!rec) throw new Error('Registro no encontrado');
    const blockClient: any = this.containerClient.getBlockBlobClient(rec.blobName);
    await blockClient.deleteIfExists();
    await this.prisma.upload.delete({ where: { id } });
    return { id, deleted: true };
  }
}