import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

// HU-41 (ARK-229): filtro opcional del listado público; sin editionId se listan todas las ediciones.
export class ListHighlightedGamesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'editionId debe ser un número entero.' })
  editionId?: number;
}
