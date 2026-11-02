import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RankingQueryDto {
  @ApiPropertyOptional({
    description: 'Edición; por defecto la activa',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  editionId?: number;

  @ApiPropertyOptional({
    description: 'Nivel (el número de N0, N1...); por defecto todos',
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  level?: number;

  @ApiPropertyOptional({
    description: 'Tamaño del podio (P-29)',
    default: 3,
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  top?: number;
}

export class TiesQueryDto extends RankingQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'RESOLVED'] })
  @IsOptional()
  @IsIn(['PENDING', 'RESOLVED'])
  status?: 'PENDING' | 'RESOLVED';

  @ApiPropertyOptional({
    description: 'Solo los empates que tocan el podio',
    default: false,
  })
  @IsOptional()
  @Transform(
    ({ obj }: { obj: { podiumOnly?: unknown } }) =>
      obj.podiumOnly === true || obj.podiumOnly === 'true',
  )
  @IsBoolean()
  podiumOnly?: boolean;
}

export class EditionQueryDto {
  @ApiPropertyOptional({
    description: 'Edición; por defecto la activa',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  editionId?: number;
}
