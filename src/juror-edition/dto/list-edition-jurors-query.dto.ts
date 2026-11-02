import { ApiPropertyOptional } from '@nestjs/swagger';
import { JurorType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_PAGE_LIMIT } from '../../common/dto/pagination-query.dto';
import { trimToUndefined } from '../../common/utils/trim-transform';
import {
  JUROR_EDITION_LIST_STATUSES,
  JurorEditionListStatus,
} from '../juror-edition.types';
import { EditionIdDto } from './edition-id.dto';

export class ListEditionJurorsQueryDto extends EditionIdDto {
  @ApiPropertyOptional({ enum: JUROR_EDITION_LIST_STATUSES })
  @IsOptional()
  @IsIn(JUROR_EDITION_LIST_STATUSES, {
    message: `status debe ser uno de: ${JUROR_EDITION_LIST_STATUSES.join(', ')}`,
  })
  status?: JurorEditionListStatus;

  @ApiPropertyOptional({ enum: JurorType })
  @IsOptional()
  @IsIn(Object.values(JurorType), {
    message: 'type debe ser OFFICIAL o BACKUP',
  })
  type?: JurorType;

  @ApiPropertyOptional({
    example: 'pérez',
    description: 'Nombre, apellido o correo (mínimo 2 caracteres)',
  })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MinLength(2, { message: 'La búsqueda debe tener al menos 2 caracteres' })
  @MaxLength(50, { message: 'La búsqueda no puede superar los 50 caracteres' })
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un número entero' })
  @Min(1, { message: 'page debe ser al menos 1' })
  page: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: MAX_PAGE_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un número entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(MAX_PAGE_LIMIT, {
    message: `limit no puede superar ${MAX_PAGE_LIMIT}`,
  })
  limit: number = 20;
}
