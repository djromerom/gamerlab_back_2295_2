import { IsEmail, IsNotEmpty, Matches } from 'class-validator';

export class ResendConfirmationDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
