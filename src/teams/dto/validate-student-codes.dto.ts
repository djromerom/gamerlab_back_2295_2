// src/teams/dto/validate-student-codes.dto.ts
import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** El paso 2 del registro revisa los códigos estudiantiles antes de avanzar. */
export class ValidateStudentCodesDto {
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((code) => (typeof code === 'string' ? code.trim() : code))
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  @MaxLength(20, {
    each: true,
    message: 'Cada código debe ser de máximo 20 caracteres',
  })
  @ArrayMinSize(1, { message: 'Debe enviar al menos un código estudiantil' })
  @ArrayMaxSize(10, { message: 'Se pueden validar máximo 10 códigos a la vez' })
  studentCodes: string[];
}
