import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsArray,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  normalizeEmailValue,
  trimString,
} from '../../common/utils/trim-transform';

export class MemberDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del integrante es obligatorio' })
  @MaxLength(50, {
    message: 'El nombre del integrante debe ser de máximo 50 caracteres',
  })
  memberFirstName: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El apellido del integrante es obligatorio' })
  @MaxLength(50, {
    message: 'El apellido del integrante debe ser de máximo 50 caracteres',
  })
  memberLastName: string;

  @Transform(normalizeEmailValue)
  @IsEmail({}, { message: 'El correo del integrante debe ser válido' })
  @IsNotEmpty({ message: 'El correo del integrante es obligatorio' })
  memberEmail: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'El código de estudiante es obligatorio' })
  @MaxLength(20, {
    message: 'El código de estudiante debe ser de máximo 20 caracteres',
  })
  studentCode: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'El NRC es obligatorio' })
  nrc: string[];
}
