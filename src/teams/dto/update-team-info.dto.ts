/* eslint-disable prettier/prettier */
import { IsString, IsOptional, MaxLength, IsUrl, ValidateIf } from 'class-validator';

export class UpdateTeamInfoDto {
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'El nombre del equipo debe ser de máximo 50 caracteres' })
  teamName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @ValidateIf((o) => o.youtubeUrl !== undefined && o.youtubeUrl !== null && o.youtubeUrl !== '')
  @IsString()
  @IsUrl({}, { message: 'La URL de YouTube debe ser válida' })
  youtubeUrl?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ValidateIf((o) => o.githubUrl !== undefined && o.githubUrl !== null && o.githubUrl !== '')
  @IsString()
  @IsUrl({}, { message: 'La URL de GitHub debe ser válida' })
  githubUrl?: string;
}

