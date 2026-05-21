import { IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateHighlightedGameDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  videogameId: number;
}
