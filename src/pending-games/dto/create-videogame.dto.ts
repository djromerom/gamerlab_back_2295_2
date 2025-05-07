import { IsInt, IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

export class CreateVideogameDto {
  @IsInt()
  @IsNotEmpty()
  id: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsNotEmpty()
  teamName: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}