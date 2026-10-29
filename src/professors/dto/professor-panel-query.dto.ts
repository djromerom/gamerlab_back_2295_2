import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const PANEL_SORT_FIELDS = ['team', 'student'] as const;
export const PANEL_SORT_ORDERS = ['asc', 'desc'] as const;
export type PanelSortField = (typeof PANEL_SORT_FIELDS)[number];
export type PanelSortOrder = (typeof PANEL_SORT_ORDERS)[number];

// Se lee del objeto original: con enableImplicitConversion, 'false' ya llegaría como true.
const toBoolean = ({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}) => {
  const value = obj[key];
  return value === true || value === 'true' || value === '1';
};

const toTrimmedOrUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Filtros del panel de profesores (HU-02 / HU-03).
 * El listado y la exportación deben usar este mismo DTO para que el archivo
 * contenga exactamente lo que se ve en pantalla.
 */
export class ProfessorPanelQueryDto {
  @ApiPropertyOptional({ description: 'ID de la feria (edición)', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'editionId debe ser un entero.' })
  @Min(1)
  editionId?: number;

  @ApiPropertyOptional({
    description: 'ID del NRC (no el código; el código se repite entre ferias)',
    example: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'nrcId debe ser un entero.' })
  @Min(1)
  nrcId?: number;

  @ApiPropertyOptional({
    description:
      'Búsqueda por nombre o código de estudiante, o por nombre o código de equipo. No distingue mayúsculas ni tildes.',
    example: 'martinez',
  })
  @IsOptional()
  @Transform(toTrimmedOrUndefined)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: PANEL_SORT_FIELDS, default: 'team' })
  @IsOptional()
  @IsIn(PANEL_SORT_FIELDS, { message: 'sortBy debe ser team o student.' })
  sortBy: PanelSortField = 'team';

  @ApiPropertyOptional({ enum: PANEL_SORT_ORDERS, default: 'asc' })
  @IsOptional()
  @IsIn(PANEL_SORT_ORDERS, { message: 'sortOrder debe ser asc o desc.' })
  sortOrder: PanelSortOrder = 'asc';
}

export class GradingReportQueryDto extends ProfessorPanelQueryDto {
  @ApiPropertyOptional({
    description:
      'true o 1: incluye Calificación Feria y Calificación Jurado Junior',
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  final: boolean = false;
}
