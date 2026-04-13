import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AuthEmailType } from '../types/email-type.type';

export class ResendAuthEmailDto {
  @ApiProperty({
    description: 'The email address to resend the email to',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'The type of email to resend',
    enum: ['VERIFICACION_EMAIL', 'RESETEAR_CONTRASENA'],
    example: 'VERIFICACION_EMAIL',
  })
  @IsEnum(['VERIFICACION_EMAIL', 'RESETEAR_CONTRASENA'])
  @IsNotEmpty()
  typeOfEmail: AuthEmailType;
}
