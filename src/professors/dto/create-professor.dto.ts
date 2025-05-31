import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateProfessorDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @Transform(({ value }) => value && typeof value === 'string' ? value.toLowerCase() : value)
  @IsString()
  @IsNotEmpty()
  email: string;
}
