import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s'-]+$/;

export class CreateStaffDto {
  @ApiProperty({ example: 'ana.perez@uninorte.edu.co' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @MaxLength(50, { message: 'El correo no puede superar los 50 caracteres' })
  email: string;

  @ApiProperty({ example: 'Ana' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(50, { message: 'El nombre no puede superar los 50 caracteres' })
  @Matches(NAME_PATTERN, {
    message: 'El nombre solo puede contener letras y espacios',
  })
  firstName: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @MaxLength(50, { message: 'El apellido no puede superar los 50 caracteres' })
  @Matches(NAME_PATTERN, {
    message: 'El apellido solo puede contener letras y espacios',
  })
  lastName: string;
}
