import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** HU-14 (ARK-213): mínimo de evaluaciones por grupo de la edición activa. */
export class UpdateContingencySettingsDto {
  @ApiProperty({
    example: 3,
    minimum: 1,
    maximum: 10,
    description:
      'Grupos con menos jurados que cuentan quedan en riesgo, y se sugieren suplentes hasta completarlo. No cambia la nota: solo cuentan las 3 primeras evaluaciones (P-10).',
  })
  @Type(() => Number)
  @IsInt({ message: 'minEvaluationsPerTeam debe ser un número entero' })
  @Min(1, { message: 'El mínimo de evaluaciones debe ser al menos 1' })
  @Max(10, { message: 'El mínimo de evaluaciones debe ser máximo 10' })
  minEvaluationsPerTeam: number;
}
