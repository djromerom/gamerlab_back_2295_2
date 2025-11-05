// src/teams/dto/videogame.dto.ts
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { UploadDto } from 'src/upload/create-upload.dto';

export class VideogameDto {
  @IsString()
  @MaxLength(30, {
    message: 'El nombre del videojuego debe ser de máximo 30 caracteres',
  })
  @IsNotEmpty({ message: 'El nombre del videojuego es obligatorio' })
  vgName: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  videoUrl?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UploadDto)
  @IsOptional()
  uploads?: UploadDto[];
}
