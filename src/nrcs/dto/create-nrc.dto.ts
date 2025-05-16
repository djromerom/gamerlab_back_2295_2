// src/nrcs/dto/create-nrc.dto.ts
import {
  IsInt,
  IsString,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export class CreateNrcDto {
  @IsInt()
  @IsNotEmpty()
  code: number;

  @IsInt()
  @IsNotEmpty()
  subjectId: number;

  @IsString()
  @IsNotEmpty()
  professorId: string;

  @IsOptional() // It has a default value, so it's optional
  @IsBoolean()
  isActive?: boolean; // It will default to 'true'
}
