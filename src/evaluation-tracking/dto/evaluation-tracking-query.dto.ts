import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, Matches } from 'class-validator';

export class EvaluationTrackingQueryDto {
  @ApiPropertyOptional({
    description: 'Nivel de los grupos (N0 a N4)',
    example: 'N2',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^N[0-4]$/, { message: 'El nivel debe ser N0, N1, N2, N3 o N4' })
  level?: string;

  @ApiPropertyOptional({
    description:
      'Día de la feria (YYYY-MM-DD) para los cortes por hora. Por defecto, hoy en Bogotá.',
    example: '2026-11-26',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato YYYY-MM-DD',
  })
  date?: string;
}
