// src/teams/dto/create-team.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  MaxLength,
  IsBoolean,
  IsOptional,
  ArrayMinSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MemberDto } from './member.dto';
import { RegistrationMemberDto } from './registration-member.dto';
import { VideogameDto } from './videogame.dto';
import { trimString } from '../../common/utils/trim-transform';

export class CreateTeamDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(50, {
    message: 'El nombre del equipo debe ser de máximo 50 caracteres',
  })
  @IsNotEmpty({ message: 'El nombre del equipo es obligatorio' })
  teamName: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El equipo debe tener al menos un integrante' })
  @ValidateNested({ each: true })
  @Type(() => RegistrationMemberDto)
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
