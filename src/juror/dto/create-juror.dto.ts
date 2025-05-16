import { IsString, IsEmail, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class CreateJurorDto {
  @MaxLength(50)
  @IsString()
  @IsNotEmpty()
  name: string;

  @MaxLength(50)
  @IsString()
  @IsNotEmpty()
  lastname: string;

  @IsNotEmpty()
  @IsEmail()
  @IsString()
  @Matches(/^[\w.-]+@uninorte\.edu\.co$/, {
    message: 'Email must be a valid @uninorte.edu.co address',
  })
  email: string;
}
