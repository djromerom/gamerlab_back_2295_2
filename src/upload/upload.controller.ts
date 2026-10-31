import { Controller, Get, Param, Post, Req, UploadedFile, UseInterceptors, Query, Delete, BadRequestException, PayloadTooLargeException, UseFilters, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AzureStorageService } from './azure-storage.service';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator'; // Add this import
import { MulterExceptionFilter } from './multer-exception.filter';
import { RolePermissionGuard } from '../auth/guards/role-permission.guard';
import { RequiredService } from '../auth/decorators/required-service.decorator';
import { PUBLIC_LIMITS, PublicThrottle } from '../common/throttle/public-throttle';
import { isAllowedImage, isZip } from './file-signature';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ZipUploadAccessGuard } from './zip-upload-access.guard';

const MAX_SAS_TTL_SEC = 3600;

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly azureService: AzureStorageService) { }

  // Público porque lo usa la inscripción web antes de crear la cuenta; con límite de peticiones (BG-02)
  @Public()
  @PublicThrottle(PUBLIC_LIMITS.imageUpload)
  @Post()
  @UseFilters(MulterExceptionFilter)
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
  @ApiResponse({
    status: 413,
    description: 'Archivo demasiado grande (máximo 1MB)',
    schema: {
      example: {
        statusCode: 413,
        message: 'El archivo es demasiado grande. Tamaño máximo permitido: 1MB',
        error: 'Payload Too Large'
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Error de validación de archivo',
    schema: {
      example: {
        statusCode: 400,
        message: 'No se proporcionó ningún archivo',
        error: 'Bad Request'
      }
    }
  })
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 1024 * 1024, // 1MB limit
    },
    fileFilter: (req, file, callback) => {
      // Optional: Add file type validation
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        return callback(new BadRequestException('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, GIF, WebP)'), false);
      }
      callback(null, true);
    },
  }))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    // Validate file exists
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    if (!isAllowedImage(file.buffer)) {
      throw new BadRequestException('El contenido del archivo no corresponde a una imagen permitida (JPEG, PNG, GIF, WebP)');
    }
    return await this.azureService.uploadFile(file);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard, ZipUploadAccessGuard)
  @PublicThrottle(PUBLIC_LIMITS.zipUpload)
  @Post('zip')
  @ApiOperation({ summary: 'Subir los archivos estáticos de un juego en forma de .zip' })
  @ApiBody({
    description: 'Archivo a subir (campo: file)',
    required: false,
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 1024 * 1024 * 100, // 100MB limit,
      files: 1
    },
    fileFilter: (req, file, callback) => {
      const allowedTypes = [
        'application/zip',
        'application/x-zip-compressed',
        'application/x-zip',
        'multipart/x-zip',
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        return callback(new BadRequestException('Tipo de archivo no permitido. Solo se permite .zip!'), false);
      }
      callback(null, true);
    },
  }))
  async uploadGameFile(@UploadedFile() file: Express.Multer.File,) {
    // Validate file existence
    if (!file) {
      throw new BadRequestException('Archivo no encontrado. Se requiere un archivo .zip!');
    }
    if (!isZip(file.buffer)) {
      throw new BadRequestException('El contenido del archivo no corresponde a un .zip');
    }
    return this.azureService.uploadFile(file);
  }

  @Get(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageUploads')
  @ApiOperation({ summary: 'Consultar un registro por ID' })
  @ApiParam({ name: 'id', description: 'UUID del registro en Postgres' })
  @ApiResponse({ status: 200, description: 'Registro encontrado' })
  async getById(@Param('id') id: string) {
    return this.azureService.getById(id);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/url')
  @ApiOperation({ summary: 'Generar URL temporal (SAS) de lectura para el blob' })
  @ApiParam({ name: 'id', description: 'UUID del registro en Postgres' })
  @ApiQuery({ name: 'ttl', required: false, description: 'Tiempo de vida del SAS en segundos (min 60, máx 3600, por defecto 3600; los valores mayores se recortan)' })
  @ApiResponse({ status: 200, description: 'URL temporal generada', schema: { example: { url: 'https://.../blob.png?sv=...&sp=r&sig=...', expiresAt: '2025-10-23T15:30:00.000Z' } } })
  @ApiResponse({ status: 403, description: 'Archivo no público y sin sesión' })
  @ApiResponse({ status: 404, description: 'Registro no encontrado' })
  async getSignedUrl(@Param('id') id: string, @Query('ttl') ttl?: string, @Req() req?: any) {
    const requested = Number(ttl);
    const ttlSec = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_SAS_TTL_SEC) : MAX_SAS_TTL_SEC;
    return this.azureService.getReadSasUrlById(id, ttlSec, !!req?.user);
  }

  @Post(':id/public')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageUploads')
  @ApiOperation({ summary: 'Marcar/Desmarcar un blob como público (flag en BD, no guarda SAS)' })
  @ApiParam({ name: 'id', description: 'UUID del registro' })
  @ApiQuery({ name: 'value', required: false, description: 'true/false (por defecto true)' })
  async markPublic(@Param('id') id: string, @Query('value') value?: string) {
    const isPublic = value === 'false' ? false : true;
    return this.azureService.markPublic(id, isPublic);
  }

  @Delete(':id')
  @UseGuards(RolePermissionGuard)
  @RequiredService('ManageUploads')
  @ApiOperation({ summary: 'Eliminar blob en Azure y registro en la BD' })
  @ApiParam({ name: 'id', description: 'UUID del registro' })
  @ApiResponse({ status: 200, description: 'Eliminado', schema: { example: { id: 'uuid', deleted: true } } })
  async delete(@Param('id') id: string) {
    return this.azureService.deleteById(id);
  }
}