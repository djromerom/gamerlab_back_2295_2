import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_DRAFT_CRITERIA = 50;
export const MAX_DRAFT_COMMENTS = 5000;

export class DraftScoreDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  criterionId: number;

  @ApiProperty({ example: 4.5, description: 'De 0 a 5, máximo 2 decimales.' })
  @Type(() => Number)
  @IsNumber()
  score: number;
}

/** HU-18: lo que el jurado lleva escrito. Puede estar incompleto (no exige todos los criterios). */
export class SaveEvaluationDraftDto {
  @ApiProperty({
    example: 0,
    description:
      'La versión del borrador que conoce el cliente: 0 si no hay borrador activo; si no, la `version` de la última respuesta. Si no coincide, 409 DRAFT_VERSION_CONFLICT.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version: number;

  @ApiPropertyOptional({
    type: [DraftScoreDto],
    description: 'Solo los criterios ya llenados. Reemplaza lo guardado.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DRAFT_CRITERIA)
  @ValidateNested({ each: true })
  @Type(() => DraftScoreDto)
  details?: DraftScoreDto[];

  @ApiPropertyOptional({ example: 'Buen arte, falta pulir controles' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DRAFT_COMMENTS)
  comments?: string;
}
