import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional } from 'class-validator';
import { VideogameDto } from 'src/teams/dto/videogame.dto';

export class UpdateVideogameDto extends PartialType(VideogameDto) {
  @IsNumber()
  @IsOptional()
  videogameStatusId: number;
}
