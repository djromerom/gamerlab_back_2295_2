import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ConfirmWarningsField } from './confirm-warnings.decorator';

export class AssignJurorToTeamDto {
  @IsString()
  @IsNotEmpty({ message: 'El ID del jurado es obligatorio' })
  jurorId: string;

  @Type(() => Number)
  @IsInt({ message: 'El ID del equipo debe ser un número entero' })
  @Min(1, { message: 'El ID del equipo debe ser mayor a 0' })
  @IsNotEmpty({ message: 'El ID del equipo es obligatorio' })
  teamId: number;

  @ConfirmWarningsField()
  confirmWarnings?: boolean;
}
