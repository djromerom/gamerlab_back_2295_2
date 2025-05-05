// src/teams/dto/register-team-user.dto.ts (o donde corresponda)
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterUserDto {
  @IsEmail({}, { message: 'El formato del correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  // ¡NECESARIO PARA EL REGISTRO EN AUTHSERVICE!
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' }) // O la longitud que requiera Supabase/tu política
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  password: string;
}
