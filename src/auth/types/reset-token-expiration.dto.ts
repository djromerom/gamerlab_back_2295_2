import { IsUUID, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AuthEmailType } from '../../email/types/email-type.type';

export class ResetTokenExpirationDto {
  @ApiProperty({
    description: 'The user ID to reset the token expiration for',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'The type of token to reset expiration for',
    enum: ['VERIFICACION_EMAIL', 'RESETEAR_CONTRASENA'],
    example: 'VERIFICACION_EMAIL'
  })
  @IsEnum(['VERIFICACION_EMAIL', 'RESETEAR_CONTRASENA'])
  @IsNotEmpty()
  typeOfToken: AuthEmailType;
}
