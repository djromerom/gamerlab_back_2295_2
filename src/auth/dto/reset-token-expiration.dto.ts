import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { AuthEmailType } from '../../email/types/email-type.type';

export class ResetTokenExpirationDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  @Matches(/^(VERIFICACION_EMAIL|RESETEAR_CONTRASENA)$/, {
    message: 'typeOfToken must be either VERIFICACION_EMAIL or RESETEAR_CONTRASENA',
  })
  typeOfToken: AuthEmailType;
}