/* eslint-disable prettier/prettier */
// src/teams/dto/create-team.dto.ts
import { IsString, IsNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MemberDto } from './member.dto';
import { VideogameDto } from './videogame.dto';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del equipo es obligatorio' })
  teamName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  members: MemberDto[];

  @ValidateNested()
  @Type(() => VideogameDto)
  videogame: VideogameDto;
  
  @IsString()
  @IsNotEmpty({ message: 'El token de reCAPTCHA es obligatorio' })
  recaptchaToken: string;
}