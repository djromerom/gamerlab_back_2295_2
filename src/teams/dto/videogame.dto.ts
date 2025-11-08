/* eslint-disable prettier/prettier */
// src/teams/dto/videogame.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUrl, ValidateIf, IsArray } from 'class-validator';

export class VideogameDto {
  @IsString()
  @MaxLength(30, { message: 'El nombre del videojuego debe ser de máximo 30 caracteres' })
  @IsNotEmpty({ message: 'El nombre del videojuego es obligatorio' })
  vgName: string;

  @IsString()
  description: string;

  @IsString()
  logoURL: string;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.videoUrl && o.videoUrl.trim() !== '')
  @IsUrl({}, { message: 'La URL de YouTube debe ser válida' })
  videoUrl?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.repoUrl && o.repoUrl.trim() !== '')
  @IsUrl({}, { message: 'La URL del repositorio debe ser válida' })
  repoUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalImages?: string[];
}
