import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ\s'-]+$/;

/** Quita los espacios de los extremos y los repetidos del medio. */
const tidy = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/**
 * HU-24 (ARK-217): alta de un jurado que llegó sin estar registrado. Solo nombre, apellido y
 * correo: la categoría (Junior) y el tipo (Suplente) son fijos y no se aceptan en la petición
 * (`whitelist` del `ValidationPipe` los descarta).
 */
export class CreateWalkInJurorDto {
  @ApiProperty({ example: 'Laura', maxLength: 100 })
  @Transform(tidy)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(NAME_PATTERN, {
    message: 'El nombre solo puede contener letras y espacios',
  })
  firstName: string;

  @ApiProperty({ example: 'Gómez Ruiz', maxLength: 100 })
  @Transform(tidy)
  @IsString({ message: 'El apellido debe ser texto' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @MaxLength(100, {
    message: 'El apellido no puede superar los 100 caracteres',
  })
  @Matches(NAME_PATTERN, {
    message: 'El apellido solo puede contener letras y espacios',
  })
  lastName: string;

  @ApiProperty({ example: 'laura.gomez@ejemplo.com', maxLength: 150 })
  @Transform(tidy)
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(150, { message: 'El correo no puede superar los 150 caracteres' })
  email: string;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      'Confirma que la persona NO es ninguna de las coincidencias por nombre (409 `SIMILAR_PEOPLE`) y la crea igual. No salta el correo repetido.',
  })
  @IsOptional()
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }) =>
      obj.confirmSimilar === true || obj.confirmSimilar === 'true',
  )
  @IsBoolean({ message: 'confirmSimilar debe ser verdadero o falso' })
  confirmSimilar?: boolean;
}
