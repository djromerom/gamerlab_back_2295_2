import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** Edición sobre la que se trabaja; si no se envía, se usa la edición activa. */
export class EditionIdDto {
  @ApiPropertyOptional({
    example: 5,
    description: 'Id de la edición; por defecto la edición activa',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'editionId debe ser un número entero' })
  @Min(1, { message: 'editionId debe ser mayor que 0' })
  editionId?: number;
}
