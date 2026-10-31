import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { MAX_PAGE_LIMIT } from '../../common/dto/pagination-query.dto';

/**
 * Paginación opcional del listado público. Sin `limit` se devuelve la lista completa
 * (la usa la home); con `limit` se recorta a MAX_PAGE_LIMIT (M9).
 */
export class ListVideogamesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => Math.min(value, MAX_PAGE_LIMIT))
  @IsInt({ message: 'Limit must be an integer.' })
  @Min(1, { message: 'Limit must be at least 1.' })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer.' })
  @Min(1, { message: 'Page must be at least 1.' })
  page?: number;
}
