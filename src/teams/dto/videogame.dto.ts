/* eslint-disable prettier/prettier */
// src/teams/dto/videogame.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class VideogameDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del videojuego es obligatorio' })
  vgName: string;

  @IsString()
  description: string;

  @IsString()
  logoURL: string;
}