// src/teams/dto/validate-emails.dto.ts
import { IsArray, IsEmail, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Transform } from 'class-transformer';

export class ValidateEmailsDto {
  // Solo se quitan espacios: la respuesta usa los correos tal como llegaron como claves, y la
  // comparación con la base ya no distingue mayúsculas
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((email) => (typeof email === 'string' ? email.trim() : email))
      : value,
  )
  @IsArray()
  @IsEmail({}, { each: true, message: 'Cada correo debe ser válido' })
  @ArrayMinSize(1, { message: 'Debe enviar al menos un correo' })
  @ArrayMaxSize(10, { message: 'Se pueden validar máximo 10 correos a la vez' })
  emails: string[];
}
