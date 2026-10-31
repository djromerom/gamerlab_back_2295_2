import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
} from 'class-validator';

export class TeamStatusQueryDto {
  @ApiProperty({
    description: 'Ids de equipos separados por coma (máximo 100)',
    example: '100,200,300',
  })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map(Number)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  teamIds: number[];

  @ApiPropertyOptional({
    description: 'Si es true, la respuesta es { status, locks }',
    example: 'true',
  })
  // Con enableImplicitConversion el `value` ya llegó como Boolean("false") === true; se lee el crudo.
  // Solo el literal `true` activa el parámetro; cualquier otro valor es false.
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }): boolean =>
      obj.includeLocks === 'true' || obj.includeLocks === true,
  )
  @IsOptional()
  @IsBoolean()
  includeLocks?: boolean;
}
