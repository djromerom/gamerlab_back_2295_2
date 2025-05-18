import { IsEmail, IsNotEmpty, Matches } from 'class-validator';

export class ResendConfirmationDto {
  @IsEmail()
  @IsNotEmpty()
  @Matches(/^[\w.-]+@uninorte\.edu\.co$/, {
    message: 'Email must be a valid @uninorte.edu.co address',
  })
  email: string;
}
