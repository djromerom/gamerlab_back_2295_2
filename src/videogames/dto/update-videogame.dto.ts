import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { VideogameDto } from 'src/teams/dto/videogame.dto';

export class UpdateVideogameDto extends PartialType(VideogameDto) {
  @IsNumber()
  @IsOptional()
  videogameStatusId: number;

  @IsString()
  @IsOptional()
  @MinLength(1) // un `name` vacío responde 400 para todos los roles
  @MaxLength(30)
  name?: string;

  // TA-36 (ARK-326): solo el administrador lo cambia (student-edit-policy.ts). No está en
  // VideogameDto, así que al inscribir el equipo el ValidationPipe lo descarta.
  // Se valida el valor original: con enableImplicitConversion, 'si' o 'false' llegarían como true.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean({ message: 'allowMobile debe ser true o false' })
  @IsOptional()
  allowMobile?: boolean;
}
