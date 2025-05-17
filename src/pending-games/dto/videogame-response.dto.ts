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