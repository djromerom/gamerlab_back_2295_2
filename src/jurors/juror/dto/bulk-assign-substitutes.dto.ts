import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { ConfirmWarningsField } from './confirm-warnings.decorator';

/** Máximo de jurados cubiertos en una sola operación (HU-09). */
export const MAX_COVERED_JURORS = 20;
/** Máximo de suplentes en una sola operación (HU-09). */
export const MAX_SUBSTITUTES = 10;

/**
 * HU-09 (ARK-215): asignar uno o varios suplentes a los grupos de uno o varios jurados.
 * Solo suma: nadie pierde grupos.
 */
export class BulkAssignSubstitutesDto {
  @ApiProperty({
    type: [String],
    example: ['d4e5f6a7-b8c9-4123-d456-678901234567'],
    description: `Jurados (o profesores) cuyos grupos de la edición activa se cubren. Sin repetir, de 1 a ${MAX_COVERED_JURORS}. Conservan todos sus grupos.`,
  })
  @IsArray({ message: 'jurorIds debe ser una lista' })
  @ArrayMinSize(1, { message: 'Selecciona al menos un jurado a cubrir' })
  @ArrayMaxSize(MAX_COVERED_JURORS, {
    message: `Se pueden cubrir máximo ${MAX_COVERED_JURORS} jurados a la vez`,
  })
  @ArrayUnique({ message: 'jurorIds no puede tener jurados repetidos' })
  @IsString({ each: true, message: 'Cada id de jurado debe ser texto' })
  @IsNotEmpty({
    each: true,
    message: 'Los ids de jurado no pueden estar vacíos',
  })
  jurorIds: string[];

  @ApiProperty({
    type: [String],
    example: ['a1b2c3d4-e5f6-4789-a012-345678901234'],
    description: `Suplentes que reciben los grupos: jurados con tipo Suplente confirmados en la edición activa. Sin repetir, de 1 a ${MAX_SUBSTITUTES}.`,
  })
  @IsArray({ message: 'substituteIds debe ser una lista' })
  @ArrayMinSize(1, { message: 'Selecciona al menos un suplente' })
  @ArrayMaxSize(MAX_SUBSTITUTES, {
    message: `Se pueden asignar máximo ${MAX_SUBSTITUTES} suplentes a la vez`,
  })
  @ArrayUnique({ message: 'substituteIds no puede tener suplentes repetidos' })
  @IsString({ each: true, message: 'Cada id de suplente debe ser texto' })
  @IsNotEmpty({
    each: true,
    message: 'Los ids de suplente no pueden estar vacíos',
  })
  substituteIds: string[];

  @ConfirmWarningsField()
  confirmWarnings?: boolean;
}
