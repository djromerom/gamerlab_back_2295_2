import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Tope de elementos por página en los listados paginados (M9). */
export const MAX_PAGE_LIMIT = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({
    message: 'includeInactive must be a boolean value (true or false).',
  })
  includeInactive: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer.' })
  @Min(1, { message: 'Limit must be at least 1.' })
  @Max(MAX_PAGE_LIMIT, { message: `Limit must be at most ${MAX_PAGE_LIMIT}.` })
  limit: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer.' })
  @Min(1, { message: 'Page must be at least 1.' })
  page: number = 1;
}
