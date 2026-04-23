import { IsEmail, IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';

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
}