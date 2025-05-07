import { IsString, IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateJurorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  @IsString()
  email: string;
}
