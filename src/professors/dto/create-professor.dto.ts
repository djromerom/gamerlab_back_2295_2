import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateProfessorDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  email: string;
}
