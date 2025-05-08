import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateVideogameDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  teamId: string;

  @IsOptional()
  @IsString()
  logo_url?: string;
}
