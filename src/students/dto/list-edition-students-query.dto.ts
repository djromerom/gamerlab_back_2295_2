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
import { MAX_PAGE_LIMIT } from '../../common/dto/pagination-query.dto';
import { trimToUndefined } from '../../common/utils/trim-transform';
import { EditionIdDto } from 'src/jurors/juror-edition/dto/edition-id.dto';
import {
  PARTICIPATION_VIDEOGAME_STATUSES,
  ParticipationVideogameStatus,
} from '../types/edition-students.type';

/** ARK-129 (HU-26): `GET /students/participation`. */
export class ListEditionStudentsQueryDto extends EditionIdDto {
  @ApiPropertyOptional({
    enum: PARTICIPATION_VIDEOGAME_STATUSES,
    description: 'Estado del videojuego del equipo en esa edición',
  })
  @IsOptional()
  @IsIn(PARTICIPATION_VIDEOGAME_STATUSES, {
    message: `videogameStatus debe ser uno de: ${PARTICIPATION_VIDEOGAME_STATUSES.join(', ')}`,
  })
  videogameStatus?: ParticipationVideogameStatus;

  @ApiPropertyOptional({
    example: 'pérez',
    description: 'Nombre, apellido, correo, código estudiantil o nombre del equipo (mínimo 2 caracteres)',
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
  @Max(MAX_PAGE_LIMIT, { message: `limit no puede superar ${MAX_PAGE_LIMIT}` })
  limit: number = 20;
}
