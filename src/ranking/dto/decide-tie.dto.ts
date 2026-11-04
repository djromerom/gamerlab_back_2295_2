import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class DecideTieDto {
  @ApiProperty({
    description: 'Clave del empate, tal como la devuelve el ranking',
    example: '3:N2:4.12:10,14',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  tieKey: string;

  @ApiPropertyOptional({
    description:
      'Ids de los equipos empatados, del primero al último. Obligatorio si no se usa useRegistration.',
    example: [14, 10],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  orderedTeamIds?: number[];

  @ApiPropertyOptional({
    description: 'true: no elegir y aplicar el criterio de inscripción',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  useRegistration?: boolean;

  @ApiPropertyOptional({
    description: 'Motivo (obligatorio para el administrador si elige el orden)',
    maxLength: 300,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(300)
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Solo administrador: edición del empate; por defecto la activa',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  editionId?: number;
}
