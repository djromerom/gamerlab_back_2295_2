// src/auth/dto/set-password.dto.ts (o donde lo quieras poner)
import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class SetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(/[A-Z]/, {
    message: 'La contraseña debe tener al menos una mayúscula',
  })
  @Matches(/[a-z]/, {
    message: 'La contraseña debe tener al menos una minúscula',
  })
  @Matches(/[0-9]/, { message: 'La contraseña debe tener al menos un número' })
  password: string;

  // Opcional: Si quieres validar la confirmación también en el backend
  // @IsString()
  // @IsNotEmpty({ message: 'La confirmación de contraseña es obligatoria' })
  // confirmPassword: string;

  // Podrías añadir un validador personalizado para asegurar que coincidan si envías ambos
}
