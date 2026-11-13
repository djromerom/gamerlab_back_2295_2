import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** HU-39 (ARK-209): marcar o desmarcar un equipo como no calificable (presentador externo). */
export class SetTeamGradableDto {
  @ApiProperty({
    example: true,
    description:
      'true: el equipo es un presentador externo (no se califica ni recibe jurados). false: vuelve a los flujos normales.',
  })
  @IsBoolean({ message: 'notGradable debe ser true o false' })
  notGradable!: boolean;
}
