// src/nrcs/dto/create-nrc.dto.ts
import {
  IsInt,
  IsString,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateNrcDto {
  @Type(() => Number)
  @IsInt()
  @Min(1000, { message: 'El código debe tener exactamente 4 dígitos.' })
  @Max(9999, { message: 'El código debe tener exactamente 4 dígitos.' })
  @IsNotEmpty()
  code: number;

  @Type(() => Number)
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
