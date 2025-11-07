import {
  BadRequestException,
  ConflictException,
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

      case 'P2025':
        throw new BadRequestException('Registro no encontrado.');

      default:
        throw new InternalServerErrorException(
          `Error de base de datos: ${error.code}`,
        );
    }
  }

  if (error instanceof Error) {
    throw new InternalServerErrorException(error.message);
  }

  throw new InternalServerErrorException('Ocurrió un error desconocido.');
}
