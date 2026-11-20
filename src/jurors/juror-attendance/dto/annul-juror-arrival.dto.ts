import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { trimToUndefined } from 'src/common/utils/trim-transform';

export const ANNULMENT_REASON_MAX_LENGTH = 500;

/** BG-49: cuerpo de la anulación de una llegada. El cuerpo puede ir vacío. */
export class AnnulJurorArrivalDto {
  @ApiPropertyOptional({
    example: 'El escáner leyó el QR del jurado de al lado',
    maxLength: ANNULMENT_REASON_MAX_LENGTH,
    description:
      'Motivo de la anulación (opcional). Un texto vacío cuenta como no enviado.',
  })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString({ message: 'El motivo debe ser un texto' })
  @MaxLength(ANNULMENT_REASON_MAX_LENGTH, {
    message: `El motivo no puede superar los ${ANNULMENT_REASON_MAX_LENGTH} caracteres`,
  })
  reason?: string;
}
