import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * HU-14 (ARK-213): rechazar la sugerencia de un grupo. Queda registro (quién, cuándo y por qué) y
 * esos suplentes no se vuelven a sugerir para ese grupo; siguen en las alternativas.
 */
export class RejectSubstituteSuggestionDto {
  @ApiProperty({ example: 12, description: 'Grupo cuya sugerencia se rechaza' })
  @Type(() => Number)
  @IsInt({ message: 'teamId debe ser un número entero' })
  @Min(1, { message: 'teamId debe ser mayor que 0' })
  teamId: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Suplentes rechazados para ese grupo. Si no se envía, se rechaza toda la sugerencia actual del grupo.',
  })
  @IsOptional()
  @IsArray({ message: 'substituteIds debe ser una lista' })
  @ArrayMaxSize(20, {
    message: 'Se pueden rechazar máximo 20 suplentes a la vez',
  })
  @ArrayUnique({ message: 'substituteIds no puede tener suplentes repetidos' })
  @IsString({ each: true, message: 'Cada id de suplente debe ser texto' })
  @IsNotEmpty({
    each: true,
    message: 'Los ids de suplente no pueden estar vacíos',
  })
  substituteIds?: string[];

  @ApiPropertyOptional({
    example: 'Prefiero asignar a un profesor del área',
    description: 'Motivo (opcional), máximo 500 caracteres',
  })
  @IsOptional()
  @IsString({ message: 'reason debe ser texto' })
  @MaxLength(500, { message: 'El motivo debe tener máximo 500 caracteres' })
  reason?: string;
}
