import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { VideogameDto } from 'src/teams/dto/videogame.dto';

export class UpdateVideogameDto extends PartialType(VideogameDto) {
  @IsNumber()
  @IsOptional()
  videogameStatusId: number;

  @IsString()
  @IsOptional()
  @MinLength(1) // un `name` vacío responde 400 para todos los roles
  @MaxLength(30)
  name?: string;
}
