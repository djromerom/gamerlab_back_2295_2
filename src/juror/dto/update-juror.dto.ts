import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { JurorCategory, JurorType } from '@prisma/client';

export class UpdateJurorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s'-]+$/, {
    message: 'El nombre solo puede contener letras y espacios',
  })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'El apellido no puede superar los 100 caracteres' })
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s'-]+$/, {
    message: 'El apellido solo puede contener letras y espacios',
  })
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(150, { message: 'El correo no puede superar los 150 caracteres' })
  email?: string;

  @IsOptional()
  @IsEnum(JurorCategory, {
    message: 'La categoría del jurado debe ser JUNIOR o SENIOR',
  })
  jurorCategory?: JurorCategory;

  @IsOptional()
  @IsEnum(JurorType, {
    message: 'El tipo de jurado debe ser OFFICIAL o BACKUP',
  })
  jurorType?: JurorType;
}