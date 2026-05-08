import { IsEmail, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CertEmailType } from '../types/cert-email.type';

export class ResendCertEmailDto {
  @ApiProperty({
    description: 'The email address to resend the email to',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'The type of email to resend',
    enum: [
      'PARTICIPATION_CERTIFICATE',
      '1ST_PLACE_CERTIFICATE',
      '2ND_PLACE_CERTIFICATE',
      '3RD_PLACE_CERTIFICATE'
    ],
    example: '1ST_PLACE_CERTIFICATE'
  })
  @IsEnum([
    'PARTICIPATION_CERTIFICATE',
    '1ST_PLACE_CERTIFICATE',
    '2ND_PLACE_CERTIFICATE',
    '3RD_PLACE_CERTIFICATE'
    ])
  @IsNotEmpty()
  typeOfEmail: CertEmailType;
}
