import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { UploadDto } from 'src/upload/create-upload.dto';

export class CreateVideogameDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  teamId: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UploadDto)
  @IsOptional()
  uploads?: UploadDto[];
}
