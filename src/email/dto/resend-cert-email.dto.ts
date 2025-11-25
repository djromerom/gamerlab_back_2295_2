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
      'PARTICIPATION_CERTIFICATE_EMAIL',
      '1ST_PLACE_CERTIFICATE_EMAIL',
      '2ND_PLACE_CERTIFICATE_EMAIL',
      '3RD_PLACE_CERTIFICATE_EMAIL'
    ],
    example: '1ST_PLACE_CERTIFICATE_EMAIL'
  })
  @IsEnum([
    'PARTICIPATION_CERTIFICATE_EMAIL',
    '1ST_PLACE_CERTIFICATE_EMAIL',
    '2ND_PLACE_CERTIFICATE_EMAIL',
    '3RD_PLACE_CERTIFICATE_EMAIL'
    ])
  @IsNotEmpty()
  typeOfEmail: CertEmailType;

  @ApiProperty({
    description: 'The certificate file to include in the email',
    example: 'base64-encoded-certificate-string'
  })
  @IsNotEmpty()
  certificate: string;
}
