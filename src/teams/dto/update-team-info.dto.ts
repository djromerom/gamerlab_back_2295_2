/* eslint-disable prettier/prettier */
import { IsString, IsOptional, MaxLength, IsUrl, ValidateIf } from 'class-validator';

export class UpdateTeamInfoDto {
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'El nombre del equipo debe ser de máximo 50 caracteres' })
  teamName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30, { message: 'El nombre del videojuego debe ser de máximo 30 caracteres' })
  videogameName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @ValidateIf((o) => o.videoUrl !== undefined && o.videoUrl !== null && o.videoUrl !== '')
  @IsString()
  @IsUrl({}, { message: 'La URL del video debe ser válida' })
  videoUrl?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsOptional()
  @ValidateIf((o) => o.githubUrl !== undefined && o.githubUrl !== null && o.githubUrl !== '')
  @IsString()
  @IsUrl({}, { message: 'La URL de GitHub debe ser válida' })
  githubUrl?: string;
}

