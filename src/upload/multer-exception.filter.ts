import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Errores de multer que `FileInterceptor` ya convirtió en excepciones de Nest (en inglés). */
const MULTER_MESSAGES: Record<string, string> = {
  'Too many files':
    'Demasiados archivos. Solo se permite un archivo por solicitud.',
  'Unexpected field':
    'Campo de archivo inesperado. Use el campo "file" para subir archivos.',
};

/**
 * Traduce al español los errores de subida y dice el peso máximo de cada ruta.
 *
 * SP-03 (ARK-38): `FileInterceptor` de Nest convierte los errores de multer en excepciones antes de
 * que lleguen aquí (`LIMIT_FILE_SIZE` → `PayloadTooLargeException('File too large')`), así que las
 * ramas por `exception.code` nunca se ejecutaban y el equipo veía «File too large» en inglés. Se
 * revisan las dos formas. Con `maxSizeMb` el 413 dice el límite real
 * (`new MulterExceptionFilter(100)`).
 */
@Catch()
export class MulterExceptionFilter implements ExceptionFilter {
  constructor(private readonly maxSizeMb?: number) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const code = (exception as { code?: unknown } | null)?.code;
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const reply = (status: number, message: string, error: string) =>
      response.status(status).json({
        statusCode: status,
        message,
        error,
        timestamp: new Date().toISOString(),
        path: request.url,
      });

    if (
      code === 'LIMIT_FILE_SIZE' ||
      exception instanceof PayloadTooLargeException
    ) {
      return reply(
        413,
        this.maxSizeMb
          ? `El archivo supera el máximo de ${this.maxSizeMb} MB.`
          : 'El archivo es demasiado grande.',
        'Payload Too Large',
      );
    }

    if (code === 'LIMIT_FILE_COUNT') {
      return reply(400, MULTER_MESSAGES['Too many files'], 'Bad Request');
    }
    if (code === 'LIMIT_UNEXPECTED_FILE') {
      return reply(400, MULTER_MESSAGES['Unexpected field'], 'Bad Request');
    }
    if (exception instanceof BadRequestException) {
      const translated = MULTER_MESSAGES[exception.message];
      if (translated) return reply(400, translated, 'Bad Request');
    }

    // Lo demás lo responde Nest como siempre.
    throw exception;
  }
}
