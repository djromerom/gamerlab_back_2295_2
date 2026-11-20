import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
} from 'class-validator';

export const SCORE_REQUIRED_MESSAGE =
  'Cada puntaje debe ser un número entre 0 y 5: no puede ser nulo, vacío ni texto. Un 0 debe enviarse de forma explícita.';

export class CreateDetailEvaluationDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  criterionId: number;

  /**
   * ARK-250: el valor se toma tal como llegó. Con la conversión implícita, `Number(null)` y
   * `Number('')` darían 0 y una nota vacía se guardaría como un 0 válido. El rango y los
   * decimales los sigue validando `scoreError` en el servicio.
   */
  @Transform(({ obj }: { obj: { score?: unknown } }) => obj.score)
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: SCORE_REQUIRED_MESSAGE },
  )
  score: number;

  // M8: las fechas las fija el servidor; se aceptan por compatibilidad pero se ignoran.
  @IsOptional()
  @IsISO8601()
  createdAt?: string;

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
