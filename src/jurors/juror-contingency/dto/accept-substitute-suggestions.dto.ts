import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ConfirmWarningsField } from 'src/jurors/juror/dto/confirm-warnings.decorator';

/** Máximo de pares grupo-suplente en una sola aceptación (HU-14). */
export const MAX_ACCEPTED_PAIRS = 200;

export class SubstitutePairDto {
  @ApiProperty({ example: 12, description: 'Grupo (equipo) en riesgo' })
  @Type(() => Number)
  @IsInt({ message: 'teamId debe ser un número entero' })
  @Min(1, { message: 'teamId debe ser mayor que 0' })
  teamId: number;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-4789-a012-345678901234',
    description:
      'Suplente confirmado de la edición activa que se suma al grupo',
  })
  @IsString({ message: 'substituteId debe ser texto' })
  @IsNotEmpty({ message: 'substituteId no puede estar vacío' })
  substituteId: string;
}

/**
 * HU-14 (ARK-213): aceptar la sugerencia de suplentes (un grupo o todos) o asignar a mano a un
 * suplente elegido de las alternativas. Solo suma: nadie pierde grupos.
 */
export class AcceptSubstituteSuggestionsDto {
  @ApiProperty({
    type: [SubstitutePairDto],
    description: `Pares grupo-suplente que se guardan, de 1 a ${MAX_ACCEPTED_PAIRS}. Para aceptar todo, envía todos los \`sugeridos\` de \`GET /juror/contingency/suggestions\`.`,
  })
  @IsArray({ message: 'assignments debe ser una lista' })
  @ArrayMinSize(1, { message: 'Elige al menos un suplente para un grupo' })
  @ArrayMaxSize(MAX_ACCEPTED_PAIRS, {
    message: `Se pueden aceptar máximo ${MAX_ACCEPTED_PAIRS} asignaciones a la vez`,
  })
  @ValidateNested({ each: true })
  @Type(() => SubstitutePairDto)
  assignments: SubstitutePairDto[];

  @ConfirmWarningsField()
  confirmWarnings?: boolean;
}
