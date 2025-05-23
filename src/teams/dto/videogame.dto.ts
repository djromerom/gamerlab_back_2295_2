/* eslint-disable prettier/prettier */
// src/teams/dto/videogame.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class VideogameDto {
  @IsString()
  @MaxLength(30, { message: 'El nombre del videojuego debe ser de máximo 30 caracteres' })
  @IsNotEmpty({ message: 'El nombre del videojuego es obligatorio' })
  vgName: string;

  @IsString()
  description: string;

  @IsString()
  logoURL: string;
}
