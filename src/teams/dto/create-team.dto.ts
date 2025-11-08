// src/teams/dto/create-team.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  MaxLength,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MemberDto } from './member.dto';
import { VideogameDto } from './videogame.dto';

export class CreateTeamDto {
  @IsString()
  @MaxLength(50, {
    message: 'El nombre del equipo debe ser de máximo 50 caracteres',
  })
  @IsNotEmpty({ message: 'El nombre del equipo es obligatorio' })
  teamName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  members: MemberDto[];

  @ValidateNested()
  @Type(() => VideogameDto)
  videogame: VideogameDto;

  @IsBoolean()
  @IsOptional()
  isExternal?: boolean;

  @IsString()
  @IsOptional()
  recaptchaToken: string;
}
