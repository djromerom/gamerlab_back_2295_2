import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ProfessorPanelQueryDto,
  toBoolean,
  toTrimmedOrUndefined,
} from './professor-panel-query.dto';

const INCLUDE_HISTORICAL_DESCRIPTION =
  'true o 1: agrega la vista global de solo lectura de equipos históricos (ferias archivadas) después de los equipos de la feria activa. Por defecto false: el listado coincide con la exportación.';

/**
 * Filtros de `GET /professors/grading-games` (HU-03). Extiende los filtros de
 * la exportación (HU-02) para que el listado y el archivo usen la misma regla.
 */
export class GradingGamesQueryDto extends ProfessorPanelQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un entero mayor o igual a 1.' })
  @Min(1, { message: 'page debe ser un entero mayor o igual a 1.' })
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero mayor o igual a 1.' })
  @Min(1, { message: 'limit debe ser un entero mayor o igual a 1.' })
  @Max(100, { message: 'limit debe ser como máximo 100.' })
  limit: number = 25;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Obsoleto (se retira el próximo sprint): alias de `search`. Si llegan `search` y `team`, gana `search`.',
  })
  @IsOptional()
  @Transform(toTrimmedOrUndefined)
  @IsString()
  @MaxLength(100)
  team?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Obsoleto (se retira el próximo sprint): alias de `search`. Si llegan `search` o `team`, ganan ellos.',
  })
  @IsOptional()
  @Transform(toTrimmedOrUndefined)
  @IsString()
  @MaxLength(100)
  student?: string;

  @ApiPropertyOptional({
    description: INCLUDE_HISTORICAL_DESCRIPTION,
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeHistorical: boolean = false;
}

/** Filtros de `GET /professors/grading-games/filter-options`. */
export class GradingFilterOptionsQueryDto {
  @ApiPropertyOptional({
    description:
      'true o 1: agrega las ferias y NRC de los equipos históricos (source = historical). Por defecto solo la feria activa, igual que el listado.',
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeHistorical: boolean = false;
}

/** `search` gana; si no viene, se usan los alias deprecados `team` y luego `student`. */
export function resolvePanelSearch(query: {
  search?: string;
  team?: string;
  student?: string;
}): string | undefined {
  return query.search ?? query.team ?? query.student;
}
