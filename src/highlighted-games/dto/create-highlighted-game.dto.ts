import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

// HU-41 (ARK-229): se envía exactamente uno de los dos; el servicio responde 400 si llegan los dos o ninguno.
export class CreateHighlightedGameDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  videogameId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  historicalVideogameId?: number;
}
