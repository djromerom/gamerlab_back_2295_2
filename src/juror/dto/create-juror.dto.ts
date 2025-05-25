import { IsString, IsEmail, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class CreateJurorDto {
  @MaxLength(50)
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @MaxLength(50)
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  @IsString()
  @Matches(/^[\w.-]+@uninorte\.edu\.co$/, {
    message: 'Email must be a valid @uninorte.edu.co address',
  })
  email: string;
}
