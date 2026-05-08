import { IsEmail, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { AuthEmailType } from '../../email/types/email-type.type';

export class ResendConfirmationDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @Matches(/^(VERIFICACION_EMAIL|RESETEAR_CONTRASENA)$/, {
    message: 'typeOfToken must be either VERIFICACION_EMAIL or RESETEAR_CONTRASENA',
  })
  typeOfToken?: AuthEmailType;
}
