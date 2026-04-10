import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  PayloadTooLargeException,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Handle Multer file size errors
    if (exception.code === 'LIMIT_FILE_SIZE') {
      const error = new PayloadTooLargeException(
        'El archivo es demasiado grande. Tamaño máximo permitido: 1MB',
      );

      return response.status(413).json({
        statusCode: 413,
        message: error.message,
        error: 'Payload Too Large',
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    // Handle other Multer errors
    if (exception.code === 'LIMIT_FILE_COUNT') {
      const error = new BadRequestException(
        'Demasiados archivos. Solo se permite un archivo por solicitud.',
      );

      return response.status(400).json({
        statusCode: 400,
        message: error.message,
        error: 'Bad Request',
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    if (exception.code === 'LIMIT_UNEXPECTED_FILE') {
      const error = new BadRequestException(
        'Campo de archivo inesperado. Use el campo "file" para subir archivos.',
      );

      return response.status(400).json({
        statusCode: 400,
        message: error.message,
        error: 'Bad Request',
        timestamp: new Date().toISOString(),
        path: request.url,
      });
    }

    // For all other exceptions, let NestJS handle them normally
    throw exception;
  }
}
