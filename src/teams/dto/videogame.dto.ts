// src/teams/dto/videogame.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUrl, ValidateIf, IsArray, ArrayMaxSize } from 'class-validator';
import { Transform } from 'class-transformer';
import { isEnvSensitiveUrl } from 'src/common/decorators/isEnvSensitiveUrl.decorator';
import { trimString, trimToUndefined } from '../../common/utils/trim-transform';

export class VideogameDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(30, {
    message: 'El nombre del videojuego debe ser de máximo 30 caracteres',
  })
  @IsNotEmpty({ message: 'El nombre del videojuego es obligatorio' })
  vgName: string;

  @IsString()
  @IsOptional()
  description?: string;

  // BG-05: el registro sin logo envía `logoUrl: ""`; vacío cuenta como sin logo
  @Transform(trimToUndefined)
  @IsString()
  @IsOptional()
  @isEnvSensitiveUrl({ message: 'La URL del logo del juego debe ser válida' })
  logoUrl?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.videoUrl && o.videoUrl.trim() !== '')
  @IsUrl({}, { message: 'La URL de YouTube debe ser válida' })
  videoUrl?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.repoUrl && o.repoUrl.trim() !== '')
  @IsUrl({}, { message: 'La URL del repositorio debe ser válida' })
  repoUrl?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      // Si viene como string separado por comas, convertir a array
      return value.split(',').map(url => url.trim()).filter(url => url.length > 0);
    }
    // Si ya es un array, retornarlo tal cual
    return value;
  })
  @IsArray({ message: 'Las imágenes adicionales deben ser un array o un string de URLs separadas por comas' })
  @ArrayMaxSize(5, { message: 'Se permite un máximo de 5 imágenes adicionales' })
  @isEnvSensitiveUrl({ each: true, message: 'La URL de cada imagen adicional debe ser válida' })
  additionalImages?: string[];

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.gameFileUrl && o.gameFileUrl.trim() !== '')
  @isEnvSensitiveUrl({ message: 'La URL del archivo del juego debe ser válida' })
  gameFileUrl?: string;

  @IsOptional()
  @IsString()
  entry?: string;
}
