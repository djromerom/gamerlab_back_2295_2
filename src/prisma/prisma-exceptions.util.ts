import {
  BadRequestException,
  ConflictException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Transforma errores conocidos de Prisma en excepciones HTTP de NestJS
export function handlePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target =
          (error.meta?.target as string[])?.join(', ') ?? 'campo único';
        throw new ConflictException(
          `Ya existe un registro con el mismo ${target}.`,
        );
      }

      case 'P2003': {
        const field = (error.meta?.field_name as string) ?? 'relación';
        throw new BadRequestException(
          `Violación de clave foránea en ${field}. Verifica que la relación exista o que no esté en uso.`,
        );
      }

      case 'P2022': {
        const column = (error.meta?.column as string) ?? 'columna desconocida';
        throw new BadRequestException(
          `La columna '${column}' no existe en la base de datos.`,
        );
      }

      case 'P2025':
        throw new BadRequestException('Registro no encontrado.');

      default:
        throw new InternalServerErrorException(
          `Error de base de datos: ${error.code}`,
        );
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    throw new BadRequestException(
      'Error de validación en la consulta a la base de datos. Verifica los parámetros enviados.',
    );
  }

  if (error instanceof HttpException) {
    throw error;
  }

  if (error instanceof Error) {
    throw new InternalServerErrorException(error.message);
  }

  throw new InternalServerErrorException('Ocurrió un error desconocido.');
}
