import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ConfirmWarningsField } from './confirm-warnings.decorator';

export class ReassignJurorAssignmentDto {
  @Type(() => Number)
  @IsInt({ message: 'El ID del equipo debe ser un número entero' })
  @Min(1, { message: 'El ID del equipo debe ser mayor a 0' })
  @IsNotEmpty({ message: 'El ID del equipo es obligatorio' })
  teamId: number;

  @IsString()
  @IsNotEmpty({ message: 'El ID del jurado actual es obligatorio' })
  currentJurorId: string;

  @IsString()
  @IsNotEmpty({ message: 'El ID del nuevo jurado es obligatorio' })
  newJurorId: string;

  @ConfirmWarningsField()
  confirmWarnings?: boolean;
}
