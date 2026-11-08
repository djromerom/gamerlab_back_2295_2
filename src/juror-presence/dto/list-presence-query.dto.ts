import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PRESENCE_INDICATORS, PresenceIndicator } from '../presence-status';

export const PRESENCE_FILTERS = [...PRESENCE_INDICATORS, 'ANY'] as const;
export type PresenceFilter = (typeof PRESENCE_FILTERS)[number];

export class ListPresenceQueryDto {
  @ApiPropertyOptional({
    enum: PRESENCE_FILTERS,
    description:
      'Solo los jurados con ese indicador; ANY = con al menos uno. Sin filtro: todos los que llegaron.',
  })
  @IsOptional()
  @IsIn(PRESENCE_FILTERS, {
    message: `indicator debe ser uno de: ${PRESENCE_FILTERS.join(', ')}`,
  })
  indicator?: PresenceIndicator | 'ANY';
}
