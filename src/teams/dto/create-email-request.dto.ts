import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsArray,
  ValidateNested,
  IsEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmailRequestDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string; // Nombre del equipo

  @IsString()
  @IsNotEmpty()
  id: string; // ID del equipo o usuario
}
