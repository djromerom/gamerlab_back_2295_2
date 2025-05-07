<<<<<<< HEAD
import { IsString, IsOptional, IsNumber } from 'class-validator';
=======
import { IsString, IsOptional } from 'class-validator';
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2

export class CreateVideogameDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  teamId: string;

  @IsOptional()
  @IsString()
<<<<<<< HEAD
  logo_url?: string;
=======
  logoUrl?: string;
>>>>>>> c71e011cee82851a09aadd5c14bbc36ee4a25fe2
}
