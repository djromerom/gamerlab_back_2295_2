import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateJurorDto {
  @IsNotEmpty()
  @MaxLength(20)
  name: string;

  @IsEmail()
  @MaxLength(30)
  email: string;
}