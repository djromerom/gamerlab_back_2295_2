import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';
import { ConfirmWarningsField } from 'src/jurors/juror/dto/confirm-warnings.decorator';
import { MAX_TEAMS_LIMIT } from './team-suggestion-query.dto';

/**
 * HU-24 (ARK-217): los grupos que el administrador confirmó (o editó) en la lista previa. Solo
 * suma: nadie pierde grupos.
 */
export class AssignWalkInTeamsDto {
  @ApiProperty({
    type: [Number],
    example: [12, 15, 18],
    description: `Ids de los grupos que recibe el suplente. Sin repetir, de 1 a ${MAX_TEAMS_LIMIT}.`,
  })
  @IsArray({ message: 'teamIds debe ser una lista' })
  @ArrayMinSize(1, { message: 'Elige al menos un grupo' })
  @ArrayMaxSize(MAX_TEAMS_LIMIT, {
    message: `Se pueden asignar máximo ${MAX_TEAMS_LIMIT} grupos a la vez`,
  })
  @ArrayUnique({ message: 'teamIds no puede tener grupos repetidos' })
  @IsInt({ each: true, message: 'Cada id de grupo debe ser un número entero' })
  @Min(1, { each: true, message: 'Los ids de grupo no son válidos' })
  teamIds: number[];

  @ConfirmWarningsField()
  confirmWarnings?: boolean;
}
