import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { BadgePaperSize, DEFAULT_BADGE_PAPER_SIZE } from '../badge-template';

export class GenerateBadgesDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Ids de los jurados. Si se omite, se generan las escarapelas de todos los jurados activos.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  jurorIds?: string[];
}

export class BadgesPdfQueryDto {
  @ApiPropertyOptional({
    description:
      'Ids de jurados separados por coma. Si se omite, incluye todas las escarapelas de la edición activa.',
    example: 'uuid-1,uuid-2',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  jurorIds?: string[];

  @ApiPropertyOptional({
    enum: BadgePaperSize,
    default: DEFAULT_BADGE_PAPER_SIZE,
    description:
      'Tamaño de la hoja: TABLOID (11 x 17 in, 35 escarapelas por hoja) o LETTER (carta horizontal, 15 por hoja). La escarapela mide lo mismo en los dos (5,4 x 6 cm, QR de 5 cm).',
  })
  @IsOptional()
  @IsEnum(BadgePaperSize, {
    message: 'paper debe ser TABLOID o LETTER.',
  })
  paper?: BadgePaperSize;
}
