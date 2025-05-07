<<<<<<< HEAD
import { IsString, IsOptional, IsNumber } from 'class-validator';
=======
import { IsString, IsOptional } from 'class-validator';
>>>>>>> dev

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
>>>>>>> dev
}
