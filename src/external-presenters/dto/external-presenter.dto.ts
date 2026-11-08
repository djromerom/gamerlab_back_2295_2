import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  normalizeEmailValue,
  trimString,
  trimToUndefined,
} from '../../common/utils/trim-transform';

const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ\s'-]+$/;
export const MAX_ORGANIZATION = 150;
export const MAX_PRESENTATION_TITLE = 200;
export const MAX_BULK_PRESENTERS = 100;

/** HU-33: alta de un presentador externo (solo el administrador). */
export class CreateExternalPresenterDto {
  @ApiProperty({ example: 'ana.perez@empresa.com' })
  @Transform(normalizeEmailValue)
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(50, { message: 'El correo no puede superar los 50 caracteres' })
  email: string;

  @ApiProperty({
    example: 'ana.perez@empresa.com',
    description:
      'HU-32: el correo repetido. Debe coincidir con `email` (sin distinguir mayúsculas).',
  })
  @Transform(normalizeEmailValue)
  @IsNotEmpty({ message: 'Repite el correo electrónico' })
  @IsString({ message: 'Repite el correo electrónico' })
  confirmEmail: string;

  @ApiProperty({ example: 'Ana' })
  @Transform(trimString)
  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(50, { message: 'El nombre no puede superar los 50 caracteres' })
  @Matches(NAME_PATTERN, {
    message: 'El nombre solo puede contener letras y espacios',
  })
  firstName: string;

  @ApiProperty({ example: 'Pérez' })
  @Transform(trimString)
  @IsString({ message: 'El apellido es obligatorio' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @MaxLength(50, { message: 'El apellido no puede superar los 50 caracteres' })
  @Matches(NAME_PATTERN, {
    message: 'El apellido solo puede contener letras y espacios',
  })
  lastName: string;

  @ApiPropertyOptional({
    example: 'Estudio Indie Caribe',
    description: 'Sale en el certificado.',
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString({ message: 'La organización debe ser texto' })
  @MaxLength(MAX_ORGANIZATION, {
    message: `La organización no puede superar los ${MAX_ORGANIZATION} caracteres`,
  })
  organization?: string;

  @ApiPropertyOptional({
    example: 'Diseño de niveles para juegos educativos',
    description: 'Sale en el certificado.',
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString({ message: 'El título de la presentación debe ser texto' })
  @MaxLength(MAX_PRESENTATION_TITLE, {
    message: `El título de la presentación no puede superar los ${MAX_PRESENTATION_TITLE} caracteres`,
  })
  presentationTitle?: string;
}

/** Carga de varios a la vez (cada fila se procesa por separado). */
export class CreateExternalPresentersBulkDto {
  @ApiProperty({ type: [CreateExternalPresenterDto] })
  @IsArray({ message: 'presenters debe ser una lista' })
  @ArrayMinSize(1, { message: 'Envía al menos un presentador' })
  @ArrayMaxSize(MAX_BULK_PRESENTERS, {
    message: `Se pueden cargar como máximo ${MAX_BULK_PRESENTERS} presentadores a la vez`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateExternalPresenterDto)
  presenters: CreateExternalPresenterDto[];
}

/** Edición: nombre y datos del certificado. El correo no se cambia (es la cuenta). */
export class UpdateExternalPresenterDto extends PartialType(
  PickType(CreateExternalPresenterDto, [
    'firstName',
    'lastName',
    'organization',
    'presentationTitle',
  ] as const),
) {}
