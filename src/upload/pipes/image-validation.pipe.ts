import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import sizeOf from 'image-size';

export interface ImageValidationOptions {
  maxTotalSize?: number; // In bytes
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

@Injectable()
export class ImageValidationPipe implements PipeTransform {
  constructor(private readonly options: ImageValidationOptions) {}

  transform(value: Express.Multer.File | Express.Multer.File[] | undefined) {
    if (!value) {
      return value;
    }

    const files = Array.isArray(value) ? value : [value];
    if (files.length === 0) {
      return value;
    }

    // Check total size
    if (this.options.maxTotalSize) {
      const totalSize = files.reduce((acc, file) => acc + file.size, 0);
      if (totalSize > this.options.maxTotalSize) {
        const sizeMB = Math.round(totalSize / 1024 / 1024 * 100) / 100;
        const limitMB = Math.round(this.options.maxTotalSize / 1024 / 1024 * 100) / 100;
        throw new BadRequestException(`El tamaño total de los archivos excede el límite permitido. Total: ${sizeMB}MB, Límite: ${limitMB}MB`);
      }
    }

    // Check dimensions and magic bytes
    for (const file of files) {
      try {
        const dimensions = sizeOf(file.buffer);

        if (!dimensions || !dimensions.width || !dimensions.height) {
          throw new BadRequestException(`No se pudieron determinar las dimensiones de la imagen: ${file.originalname}`);
        }

        const { width, height } = dimensions;

        if (this.options.minWidth && width < this.options.minWidth) {
          throw new BadRequestException(`La imagen ${file.originalname} es muy pequeña. Ancho mínimo: ${this.options.minWidth}px, Ancho actual: ${width}px`);
        }

        if (this.options.minHeight && height < this.options.minHeight) {
          throw new BadRequestException(`La imagen ${file.originalname} es muy pequeña. Alto mínimo: ${this.options.minHeight}px, Alto actual: ${height}px`);
        }

        if (this.options.maxWidth && width > this.options.maxWidth) {
          throw new BadRequestException(`La imagen ${file.originalname} es muy grande. Ancho máximo: ${this.options.maxWidth}px, Ancho actual: ${width}px`);
        }

        if (this.options.maxHeight && height > this.options.maxHeight) {
          throw new BadRequestException(`La imagen ${file.originalname} es muy grande. Alto máximo: ${this.options.maxHeight}px, Alto actual: ${height}px`);
        }
      } catch (error: any) {
        if (error instanceof BadRequestException) {
          throw error; // Re-throw our custom exceptions
        }
        // If image-size throws, it's typically because it's not a valid image format
        throw new BadRequestException(`El archivo ${file.originalname} no es una imagen válida o está corrupto.`);
      }
    }

    return value;
  }
}
