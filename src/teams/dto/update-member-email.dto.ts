/* eslint-disable prettier/prettier */
import { IsEmail, IsNotEmpty, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateMemberEmailDto {
  @Transform(({ value }) =>
    value && typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo debe ser válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  email: string;
}
