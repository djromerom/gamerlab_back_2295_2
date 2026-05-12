import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignJurorToTeamDto {
  @IsString()
  @IsNotEmpty({ message: 'El ID del jurado es obligatorio' })
  jurorId: string;

  @Type(() => Number)
  @IsInt({ message: 'El ID del equipo debe ser un número entero' })
  @Min(1, { message: 'El ID del equipo debe ser mayor a 0' })
  @IsNotEmpty({ message: 'El ID del equipo es obligatorio' })
  teamId: number;
}