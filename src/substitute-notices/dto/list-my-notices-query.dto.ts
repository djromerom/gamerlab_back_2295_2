import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const NOTICE_STATUS_FILTERS = ['unread', 'all'] as const;
export type NoticeStatusFilter = (typeof NOTICE_STATUS_FILTERS)[number];

export class ListMyNoticesQueryDto {
  @ApiPropertyOptional({
    enum: NOTICE_STATUS_FILTERS,
    default: 'unread',
    description:
      'unread = solo los avisos sin leer (por defecto); all = también los leídos, primero los sin leer.',
  })
  @IsOptional()
  @IsIn(NOTICE_STATUS_FILTERS, {
    message: `status debe ser uno de: ${NOTICE_STATUS_FILTERS.join(', ')}`,
  })
  status?: NoticeStatusFilter;
}
