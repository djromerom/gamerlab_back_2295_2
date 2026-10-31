import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { VideogameDto } from 'src/teams/dto/videogame.dto';

export class UpdateVideogameDto extends PartialType(VideogameDto) {
  @IsNumber()
  @IsOptional()
  videogameStatusId: number;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  name?: string;
}
