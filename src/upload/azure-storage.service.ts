import { Injectable, BadRequestException, ForbiddenException, NotFoundException, PayloadTooLargeException, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import { BlobServiceClient, BlockBlobClient, BlobSASPermissions, StorageSharedKeyCredential, generateBlobSASQueryParameters, ContainerClient } from '@azure/storage-blob';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { Upload } from '@prisma/client';
import JSZip from 'jszip';

@Injectable()
export class AzureStorageService implements OnModuleInit {
  private readonly containerClient: ContainerClient;
  private readonly credential: StorageSharedKeyCredential;

  constructor(private readonly prisma: PrismaService) {
    //armar containerClient y credential sin importar el ambiente.
    //  => En dev, saca las credenciales del connection string por defecto de Azurite
    //  => En prod, saca las credenciales de las .env
    const containerName = process.env.AZURE_CONTAINER;
    if (!containerName) throw new Error('AZURE_CONTAINER no está definido en el .env');

    let blobServiceClient: BlobServiceClient;

    if (process.env.NODE_ENV === 'development') {
      const connString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (!connString) throw new Error('AZURE_STORAGE_CONNECTION_STRING no está definido en el .env');

      // Azurite connection strings always carry AccountName + AccountKey
      const accountNameMatch = connString.match(/AccountName=([^;]+)/);
      const accountKeyMatch = connString.match(/AccountKey=([^;]+)/);
      if (!accountNameMatch || !accountKeyMatch) throw new Error('Connection string inválido');

      this.credential = new StorageSharedKeyCredential(accountNameMatch[1], accountKeyMatch[1]);
      blobServiceClient = BlobServiceClient.fromConnectionString(connString);
    } else {
      const accountName = process.env.AZURE_ACCOUNT_NAME;
      const accountKey = process.env.AZURE_ACCOUNT_KEY;
      if (!accountName || !accountKey) throw new Error('Faltan AZURE_ACCOUNT_NAME o AZURE_ACCOUNT_KEY en .env');

      this.credential = new StorageSharedKeyCredential(accountName, accountKey);
      blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        this.credential,
      );
    }

    this.containerClient = blobServiceClient.getContainerClient(containerName);
  }

  async onModuleInit() {
    //crea el bucket si no existe (importante para el ambiente de desarrollo)
    await this.containerClient.createIfNotExists();
  }

  async uploadFile(file: Express.Multer.File): Promise<Upload> {
    //check for zipfile entrypoint (.html file to embed in frontend gameplayer)
    let entry: string = '';
    if (file.originalname.includes(".zip")) {
      const zip = await JSZip.loadAsync(file.buffer);

      //filtrar una lista de posibles entrypoints dentro del zip
      const htmlFiles = Object.keys(zip.files).filter(
        name => {
          return name.endsWith('.html')
        }
      );

      //si existe algún html, preferir servir index.html. sino, el primero que haya salido
      if (htmlFiles.length !== 0) {
        entry = htmlFiles.find(f => f.endsWith('index.html')) ?? htmlFiles[0];
      } else {
        throw new BadRequestException('El archivo .zip no contiene ningún archivo .html. Sin esto, no puede ser servido.')
      }

    }

    //files need to be chunked so that Azure doesnt return a 401 (payload too large)
    const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB per block
    const blobName = `${Date.now()}-${path.basename(file.originalname)}`;
    const blockBlobClient: BlockBlobClient = this.containerClient.getBlockBlobClient(blobName);

    try {
      const blockIds: string[] = [];
      let offset = 0;
      let blockIndex = 0;

      while (offset < file.buffer.length) {
        const chunk = file.buffer.subarray(offset, offset + CHUNK_SIZE);

        // Block IDs must be base64, same length across all blocks
        const blockId = Buffer.from(
          String(blockIndex).padStart(6, '0')
        ).toString('base64');

        await blockBlobClient.stageBlock(blockId, chunk, chunk.length);

        blockIds.push(blockId);
        offset += CHUNK_SIZE;
        blockIndex++;
      }

      // Commit all staged blocks as one blob
      await blockBlobClient.commitBlockList(blockIds, {
        blobHTTPHeaders: { blobContentType: file.mimetype },
      });


      return this.prisma.upload.create({
        data: {
          blobName,
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          //cuando se monten archivos ZIP de juego, 'entry' se le envía al front para que sepa qué archivo servir dentro del zip.
          entry: (entry !== '') ? entry : null,
          isPublic: false,
        },
      });
    } catch (error: any) {
      // Handle Azure-specific errors
      if (error.statusCode === 413 || error.code === 'REQUEST_BODY_TOO_LARGE') {
        throw new PayloadTooLargeException();
      }

      if (error.statusCode === 400) {
        throw new BadRequestException(`Error de Azure Storage: ${error.message || 'Solicitud inválida'}`);
      }

      // Log and re-throw unexpected errors
      console.error('Error uploading to Azure Storage:', {
        error: error.message,
        statusCode: error.statusCode,
        code: error.code,
        fileName: file.originalname,
        fileSize: file.size,
      });

      throw new InternalServerErrorException('Error interno al subir el archivo. Por favor, inténtelo de nuevo.');
    }
  }

  async getById(id: string): Promise<Upload | null> {
    return this.prisma.upload.findUnique({ where: { id } });
  }

  // Genera SAS de lectura por blob (dinámico)
  async getReadSasUrlById(id: string, ttlSec: number = 900, authenticated = false): Promise<{ url: string; expiresAt: string }> {
    const rec = await this.getById(id);
    if (!rec) throw new NotFoundException('Registro no encontrado');
    if (!rec.isPublic && !authenticated) throw new ForbiddenException('Este archivo no es público');

    const expiresOn = new Date(Date.now() + Math.min(Math.max(60, ttlSec), 3600) * 1000);
    const blobClient = this.containerClient.getBlockBlobClient(rec.blobName);

    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerClient.containerName,
        blobName: rec.blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      this.credential,
    ).toString();

    return {
      url: this.normalizeUrl(`${blobClient.url}?${sas}`),
      expiresAt: expiresOn.toISOString(),
    };
  }

  /**
   * En desarrollo (Azurite) la URL interna puede apuntar a 127.0.0.1 o al
   * hostname del contenedor Docker. El browser del front siempre necesita
   * llegar por localhost:10000, así que reemplazamos el host aquí.
   * En producción la URL pasa sin modificaciones.
   */
  private normalizeUrl(rawUrl: string): string {
    if (process.env.NODE_ENV !== 'development') return rawUrl;

    try {
      const parsed = new URL(rawUrl);
      parsed.hostname = 'localhost';
      parsed.port = '10000';
      return parsed.toString();
    } catch {
      // Si por alguna razón la URL no es parseable, la devolvemos tal cual
      return rawUrl;
    }
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