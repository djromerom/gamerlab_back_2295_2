import { Type } from 'class-transformer';
import { IsString, IsInt, IsArray, IsOptional } from 'class-validator';

export class VideogameResponseDto {
  @Type(() => Number)
  @IsInt()
  videogameId: number;

  @Type(() => String)
  @IsString()
  videogameName: string;

  @Type(() => String)
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @Type(() => String)
  @IsString()
  @IsOptional()
  description?: string; // Agregar el campo "descripcion"

  @Type(() => String)
  @IsString()
  teamName: string;

  // [MODIFICACIÓN]: Agregado campo teamCode para enviarlo al frontend y extraer el fragmento numérico.
  // [AUTOR]: IA  |  [FECHA]: 2026-05-27
  @Type(() => String)
  @IsString()
  @IsOptional()
  teamCode?: string;

  @Type(() => Array)
  @IsArray()
  members: { fullName: string }[];

  @Type(() => String)
  @IsString()
  @IsOptional()
  nrc?: string;

  @Type(() => String) 
  @IsString()
  @IsOptional()
  subject?: string;
}