import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { MAX_PAGE_LIMIT } from 'src/common/dto/pagination-query.dto';
import { trimToUndefined } from 'src/common/utils/trim-transform';
import {
  ATTENDANCE_STATUSES,
  AttendanceStatus,
} from '../juror-attendance.types';

export class ListAttendanceQueryDto {
  @ApiPropertyOptional({
    enum: ATTENDANCE_STATUSES,
    description: 'PRESENT = ya llegó; MISSING = todavía no tiene registro',
  })
  @IsOptional()
  @IsIn(ATTENDANCE_STATUSES, {
    message: `status debe ser uno de: ${ATTENDANCE_STATUSES.join(', ')}`,
  })
  status?: AttendanceStatus;

  @ApiPropertyOptional({
    example: 'pérez',
    description: 'Nombre o apellido, sin importar tildes (mínimo 2 caracteres)',
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

  @ApiPropertyOptional({ example: 50, default: 50, maximum: MAX_PAGE_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un número entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(MAX_PAGE_LIMIT, {
    message: `limit no puede superar ${MAX_PAGE_LIMIT}`,
  })
  limit: number = 50;
}
