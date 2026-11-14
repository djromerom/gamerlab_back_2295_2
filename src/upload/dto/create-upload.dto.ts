import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class UploadDto {
  @IsString()
  @IsNotEmpty()
  blobName: string;

  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsString()
  @IsNotEmpty()
  mimetype: string;

  @IsInt()
  @IsNotEmpty()
  size: number;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
