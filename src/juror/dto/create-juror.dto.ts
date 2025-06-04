import { Transform } from 'class-transformer';
import { IsString, IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateJurorDto {
  @MaxLength(50)
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @MaxLength(50)
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @Transform(({ value }) => value && typeof value === 'string' ? value.toLowerCase() : value)
  @IsNotEmpty()
  @IsEmail()
  @IsString()
  email: string;
}
