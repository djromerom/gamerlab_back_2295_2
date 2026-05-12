import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { JurorCategory, JurorType } from '@prisma/client';

export class CreateJurorDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s'-]+$/, {
    message: 'El nombre solo puede contener letras y espacios',
  })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @MaxLength(100, { message: 'El apellido no puede superar los 100 caracteres' })
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s'-]+$/, {
    message: 'El apellido solo puede contener letras y espacios',
  })
  lastName: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @MaxLength(150, { message: 'El correo no puede superar los 150 caracteres' })
  email: string;

  @IsEnum(JurorCategory, {
    message: 'La categoría del jurado debe ser JUNIOR o SENIOR',
  })
  @IsNotEmpty({ message: 'La categoría del jurado es obligatoria' })
  jurorCategory: JurorCategory;

  @IsEnum(JurorType, {
    message: 'El tipo de jurado debe ser OFFICIAL o BACKUP',
  })
  @IsNotEmpty({ message: 'El tipo de jurado es obligatorio' })
  jurorType: JurorType;
}