import { IsString, IsOptional } from 'class-validator';

export class CreateVideogameDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  teamId: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
