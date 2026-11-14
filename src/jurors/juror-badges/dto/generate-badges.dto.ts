import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';

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
}
