// src/teams/dto/update-team.dto.ts
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateVideogameDto } from 'src/videogames/dto/update-videogame.dto';
import { UpdateMemberDto } from './update-member.dto';

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, {
    message: 'El nombre del equipo debe ser de máximo 50 caracteres',
  })
  teamName?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateMemberDto)
  members?: UpdateMemberDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateVideogameDto)
  videogame?: UpdateVideogameDto;

  @IsOptional()
  @IsBoolean()
  isExternal?: boolean;
}
