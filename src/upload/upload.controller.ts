import { Controller, Get, Param, Post, UploadedFile, UseInterceptors, Query, Delete } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AzureStorageService } from './azure-storage.service';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator'; // Add this import

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly azureService: AzureStorageService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Subir una imagen a Azure Blob Storage; guarda solo blobName en Postgres' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo a subir (campo: file)',
    required: true,
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Registro creado',
    schema: {
      example: {
        id: 'e0d1a4d4-3f6a-4b6e-8d51-6ef7f9f0c1a2',
        blobName: '1699999999-foto.png',
        filename: 'foto.png',
        mimetype: 'image/png',
        size: 123456,
        isPublic: false,
        createdAt: '2025-10-23T13:45:00.000Z'
      }
    }
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    const saved = await this.azureService.uploadFile(file);
    return saved;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un registro por ID' })
  @ApiParam({ name: 'id', description: 'UUID del registro en Postgres' })
  @ApiResponse({ status: 200, description: 'Registro encontrado' })
  async getById(@Param('id') id: string) {
    return this.azureService.getById(id);
  }

  @Public()
  @Get(':id/url')
  @ApiOperation({ summary: 'Generar URL temporal (SAS) de lectura para el blob' })
  @ApiParam({ name: 'id', description: 'UUID del registro en Postgres' })
  @ApiQuery({ name: 'ttl', required: false, description: 'Tiempo de vida del SAS en segundos (min 60, por defecto 3 años)' })
  @ApiResponse({ status: 200, description: 'URL temporal generada', schema: { example: { url: 'https://.../blob.png?sv=...&sp=r&sig=...', expiresAt: '2025-10-23T15:30:00.000Z' } } })
  async getSignedUrl(@Param('id') id: string, @Query('ttl') ttl?: string) {
    const ttlSec = Number(ttl) || 100000000;
    return this.azureService.getReadSasUrlById(id, ttlSec);
  }

  @Post(':id/public')
  @ApiOperation({ summary: 'Marcar/Desmarcar un blob como público (flag en BD, no guarda SAS)' })
  @ApiParam({ name: 'id', description: 'UUID del registro' })
  @ApiQuery({ name: 'value', required: false, description: 'true/false (por defecto true)' })
  async markPublic(@Param('id') id: string, @Query('value') value?: string) {
    const isPublic = value === 'false' ? false : true;
    return this.azureService.markPublic(id, isPublic);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar blob en Azure y registro en la BD' })
  @ApiParam({ name: 'id', description: 'UUID del registro' })
  @ApiResponse({ status: 200, description: 'Eliminado', schema: { example: { id: 'uuid', deleted: true } } })
  async delete(@Param('id') id: string) {
    return this.azureService.deleteById(id);
  }
}