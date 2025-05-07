import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateProfessorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  email: string;
}
