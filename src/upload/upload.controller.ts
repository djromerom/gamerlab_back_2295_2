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
  @ApiOperation({ summary: 'Upload an image to Azure Blob Storage; saves only blobName in Postgres' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File to upload (field: file)',
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
    description: 'Record created',
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
  @ApiOperation({ summary: 'Get a record by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the record in Postgres' })
  @ApiResponse({ status: 200, description: 'Record found' })
  async getById(@Param('id') id: string) {
    return this.azureService.getById(id);
  }

  @Public()
  @Get(':id/url')
  @ApiOperation({ summary: 'Generate temporary read URL (SAS) for the blob' })
  @ApiParam({ name: 'id', description: 'UUID of the record in Postgres' })
  @ApiQuery({ name: 'ttl', required: false, description: 'SAS time-to-live in seconds (min 60, default 3 years)' })
  @ApiResponse({ status: 200, description: 'Temporary URL generated', schema: { example: { url: 'https://.../blob.png?sv=...&sp=r&sig=...', expiresAt: '2025-10-23T15:30:00.000Z' } } })
  async getSignedUrl(@Param('id') id: string, @Query('ttl') ttl?: string) {
    const ttlSec = Number(ttl) || 100000000;
    return this.azureService.getReadSasUrlById(id, ttlSec);
  }

  @Post(':id/public')
  @ApiOperation({ summary: 'Mark/Unmark a blob as public (flag in DB, does not save SAS)' })
  @ApiParam({ name: 'id', description: 'UUID of the record' })
  @ApiQuery({ name: 'value', required: false, description: 'true/false (default true)' })
  async markPublic(@Param('id') id: string, @Query('value') value?: string) {
    const isPublic = value === 'false' ? false : true;
    return this.azureService.markPublic(id, isPublic);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete blob in Azure and record in the database' })
  @ApiParam({ name: 'id', description: 'UUID of the record' })
  @ApiResponse({ status: 200, description: 'Deleted', schema: { example: { id: 'uuid', deleted: true } } })
  async delete(@Param('id') id: string) {
    return this.azureService.deleteById(id);
  }
}