import { IsEmail, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TeamEmailType } from '../types/team-email.type';

export class ResendTeamEmailDto {
  @ApiProperty({
    description: 'The email address to resend the email to',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'The type of email to resend',
    enum: ['VERIFICACION_EMAIL', 'RESETEAR_CONTRASENA'],
    example: 'VERIFICACION_EMAIL'
  })
  @IsEnum(['VERIFICACION_EMAIL', 'RESETEAR_CONTRASENA'])
  @IsNotEmpty()
  typeOfEmail: TeamEmailType;

  @ApiProperty({
    description: 'The rejection reason for the videogame, if applicable',
    example: 'The videogame does not meet the quality standards.'
  })
  @IsOptional()
  rejectionReason?: string;
}
